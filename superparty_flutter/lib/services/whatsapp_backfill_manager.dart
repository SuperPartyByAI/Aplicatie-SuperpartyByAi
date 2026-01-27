import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/errors/app_exception.dart';
import 'whatsapp_api_service.dart';

/// Immutable snapshot of backfill status for UI (syncing, last success/error).
class BackfillState {
  final bool isSyncing;
  final Set<String> accountIds;
  final DateTime? lastSuccess;
  final String? lastError;

  const BackfillState({
    required this.isSyncing,
    this.accountIds = const {},
    this.lastSuccess,
    this.lastError,
  });
}

/// Manages automatic WhatsApp history backfill: throttle, debounce, single-flight.
/// Singleton; use [WhatsAppBackfillManager.instance].
///
/// - Debounce: ignore [ensureBackfillForAccounts] calls within [debounceSeconds].
/// - Throttle: skip if last **success** < 6h; skip if last **attempt** < 10 min (anti-spam on failures).
/// - In-flight: no concurrent backfill per account ([_runningAccountIds]).
/// - "Needs backfill": Firestore markers + probe 1–3 threads for messages; skip if recent/has data.
class WhatsAppBackfillManager {
  WhatsAppBackfillManager._();
  static final WhatsAppBackfillManager _instance = WhatsAppBackfillManager._();
  factory WhatsAppBackfillManager() => _instance;
  static WhatsAppBackfillManager get instance => _instance;

  static const int debounceSeconds = 8;
  static const int cooldownSuccessHours = 6;
  static const int attemptCooldownMinutes = 10;
  static const _prefixSuccess = 'whatsapp_lastBackfillSuccessAt_';
  static const _prefixAttempt = 'whatsapp_lastBackfillAttemptAt_';

  final WhatsAppApiService _api = WhatsAppApiService.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final Set<String> _runningAccountIds = {};
  DateTime? _lastEnsureCallAt;
  SharedPreferences? _prefs;
  final ValueNotifier<BackfillState?> statusNotifier = ValueNotifier<BackfillState?>(null);

  Future<SharedPreferences> _getPrefs() async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  /// Last success time for [accountId] (debug UI).
  Future<DateTime?> getLastSuccessAt(String accountId) async {
    final prefs = await _getPrefs();
    final ms = prefs.getInt('$_prefixSuccess$accountId');
    return ms != null ? DateTime.fromMillisecondsSinceEpoch(ms) : null;
  }

  /// Last attempt time for [accountId] (debug UI).
  Future<DateTime?> getLastAttemptAt(String accountId) async {
    final prefs = await _getPrefs();
    final ms = prefs.getInt('$_prefixAttempt$accountId');
    return ms != null ? DateTime.fromMillisecondsSinceEpoch(ms) : null;
  }

  static DateTime? _timestampToDate(Object? v) {
    if (v == null) return null;
    if (v is Timestamp) return v.toDate();
    if (v is Map && v['_seconds'] != null) {
      final sec = v['_seconds'];
      if (sec is int) return DateTime.fromMillisecondsSinceEpoch(sec * 1000);
    }
    return null;
  }

  /// True if we should run backfill for [accountId]. Uses Firestore markers + probe.
  /// a) accounts/{id}: lastBackfillAt or lastAutoBackfillAt recent (< 6h) => NOT needed.
  /// b) Else probe 1–3 threads; if any has ≥1 message => NOT needed.
  /// c) On Firestore error => needed (log only).
  Future<bool> needsBackfill(String accountId) async {
    try {
      final accountRef = _firestore.collection('accounts').doc(accountId);
      final accountSnap = await accountRef.get();
      if (accountSnap.exists) {
        final d = accountSnap.data();
        final lastBackfillAt = _timestampToDate(d?['lastBackfillAt']) ??
            _timestampToDate(d?['lastAutoBackfillAt']);
        if (lastBackfillAt != null) {
          const threshold = Duration(hours: cooldownSuccessHours);
          if (DateTime.now().difference(lastBackfillAt) < threshold) {
            if (kDebugMode) {
              debugPrint(
                  '[WhatsAppBackfillManager] needsBackfill($accountId): skip (lastBackfillAt/lastAutoBackfillAt recent)');
            }
            return false;
          }
        }
      }

      final threadsSnap = await _firestore
          .collection('threads')
          .where('accountId', isEqualTo: accountId)
          .orderBy('lastMessageAt', descending: true)
          .limit(3)
          .get();

      for (final doc in threadsSnap.docs) {
        final msSnap = await _firestore
            .collection('threads')
            .doc(doc.id)
            .collection('messages')
            .limit(1)
            .get();
        if (msSnap.docs.isNotEmpty) {
          if (kDebugMode) {
            debugPrint('[WhatsAppBackfillManager] needsBackfill($accountId): skip (probe has messages)');
          }
          return false;
        }
      }
      return true;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[WhatsAppBackfillManager] needsBackfill($accountId): error $e, assume needs');
      }
      return true;
    }
  }

  /// Ensures backfill has run for [accountIds] if needed (throttled + debounced + needs-backfill).
  /// Call after accounts are loaded / on Inbox open / on app resume. **Caller must gate by admin.**
  Future<void> ensureBackfillForAccounts(Set<String> accountIds) async {
    if (accountIds.isEmpty) return;
    if (FirebaseAuth.instance.currentUser == null) return;

    final now = DateTime.now();
    if (_lastEnsureCallAt != null &&
        now.difference(_lastEnsureCallAt!).inSeconds < debounceSeconds) {
      if (kDebugMode) {
        debugPrint('[WhatsAppBackfillManager] Debounce skip: lastEnsure=$_lastEnsureCallAt');
      }
      return;
    }
    _lastEnsureCallAt = now;

    final prefs = await _getPrefs();
    const successCooldown = Duration(hours: cooldownSuccessHours);
    const attemptCooldown = Duration(minutes: attemptCooldownMinutes);
    final toRun = <String>[];

    for (final id in accountIds) {
      if (_runningAccountIds.contains(id)) continue;

      final lastSuccessMs = prefs.getInt('$_prefixSuccess$id');
      final lastSuccess = lastSuccessMs != null
          ? DateTime.fromMillisecondsSinceEpoch(lastSuccessMs)
          : null;
      if (lastSuccess != null && now.difference(lastSuccess) < successCooldown) {
        if (kDebugMode) debugPrint('[WhatsAppBackfillManager] Throttle skip $id: last success < 6h');
        continue;
      }

      final lastAttemptMs = prefs.getInt('$_prefixAttempt$id');
      final lastAttempt = lastAttemptMs != null
          ? DateTime.fromMillisecondsSinceEpoch(lastAttemptMs)
          : null;
      if (lastAttempt != null && now.difference(lastAttempt) < attemptCooldown) {
        if (kDebugMode) debugPrint('[WhatsAppBackfillManager] Throttle skip $id: last attempt < 10m');
        continue;
      }

      final needs = await needsBackfill(id);
      if (!needs) continue;
      toRun.add(id);
    }

    if (toRun.isEmpty) {
      if (kDebugMode) {
        debugPrint('[WhatsAppBackfillManager] Throttle/needs skip: none to run');
      }
      return;
    }

    DateTime? lastSuccess;
    String? lastError;

    for (final accountId in toRun) {
      _runningAccountIds.add(accountId);
      statusNotifier.value = BackfillState(
        isSyncing: true,
        accountIds: Set<String>.from(_runningAccountIds),
      );

      try {
        await _api.backfillAccount(accountId: accountId);
        lastSuccess ??= DateTime.now();
        final t = lastSuccess;
        await prefs.setInt('$_prefixSuccess$accountId', t.millisecondsSinceEpoch);
        await prefs.setInt('$_prefixAttempt$accountId', t.millisecondsSinceEpoch);
      } catch (e) {
        lastError ??= e is UnauthorizedException || e is ForbiddenException
            ? 'Necesită super-admin.'
            : e.toString();
        await prefs.setInt('$_prefixAttempt$accountId', now.millisecondsSinceEpoch);
        if (kDebugMode) {
          debugPrint('[WhatsAppBackfillManager] backfill error ($accountId): $e');
        }
      } finally {
        _runningAccountIds.remove(accountId);
        final stillRunning = _runningAccountIds.isNotEmpty;
        statusNotifier.value = BackfillState(
          isSyncing: stillRunning,
          accountIds: Set<String>.from(_runningAccountIds),
          lastSuccess: lastSuccess,
          lastError: lastError,
        );
      }
    }
  }
}
