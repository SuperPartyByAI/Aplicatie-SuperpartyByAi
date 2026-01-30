import 'dart:async';
import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:crypto/crypto.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/errors/app_exception.dart';
import '../../core/config/env.dart';
import '../../config/admin_config.dart';
import '../../config/admin_phone.dart';
import '../../models/thread_model.dart';
import '../../services/whatsapp_api_service.dart';
import '../../utils/threads_query.dart';
import '../../utils/inbox_schema_guard.dart';
import '../debug/whatsapp_diagnostics_screen.dart';
import 'package:cached_network_image/cached_network_image.dart';

/// WhatsApp Inbox Screen - List threads per accountId
/// Uses Firestore streams for real-time updates, with manual refresh fallback.
class WhatsAppInboxScreen extends StatefulWidget {
  const WhatsAppInboxScreen({super.key});

  @override
  State<WhatsAppInboxScreen> createState() => _WhatsAppInboxScreenState();
}

class _WhatsAppInboxScreenState extends State<WhatsAppInboxScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;

  List<Map<String, dynamic>> _accounts = [];
  bool _isBackfilling = false;
  // ignore: unused_field - used for loading state / future UI
  bool _isLoadingAccounts = true;
  bool _isLoadingThreads = false;
  String _searchQuery = '';
  List<ThreadModel> _threads = [];
  String? _errorMessage;
  bool _hasRunAutoBackfill = false; // Track if auto-backfill has run
  
  // Firestore thread streams (per account)
  final Map<String, StreamSubscription<QuerySnapshot>> _threadSubscriptions = {};
  final Map<String, List<Map<String, dynamic>>> _threadsByAccount = {};
  /// Account IDs we last started listeners for. Skip re-subscribe when unchanged.
  Set<String> _activeAccountIds = {};
  
  /// Admin-only screen: if non-admin reaches route, show Forbidden (no listeners/backfill).
  bool _forbidden = false;
  /// Guard: do not show main UI or Forbidden until admin check has completed.
  bool _adminCheckDone = false;
  
  Timer? _autoRefreshTimer;

  Future<void> _copyAuthTokensToClipboard() async {
    if (!kDebugMode) return;
    final idToken = await FirebaseAuth.instance.currentUser?.getIdToken(true);
    String? appCheckToken;
    try {
      appCheckToken = await FirebaseAppCheck.instance.getToken(true);
    } catch (e) {
      appCheckToken = null;
      debugPrint('[WhatsAppDebug] appCheckToken error: ${e.runtimeType}');
    }
    final idTokenLen = idToken?.length ?? 0;
    final idTokenDotCount = idToken == null ? 0 : '.'.allMatches(idToken).length;
    final idTokenHash = idToken == null || idToken.isEmpty
        ? 'none'
        : sha256.convert(utf8.encode(idToken)).toString().substring(0, 8);
    final appCheckLen = appCheckToken?.length ?? 0;
    final appCheckHash = appCheckToken == null || appCheckToken.isEmpty
        ? 'none'
        : sha256.convert(utf8.encode(appCheckToken)).toString().substring(0, 8);
    debugPrint(
      '[WhatsAppDebug] idTokenLen=$idTokenLen, idTokenDotCount=$idTokenDotCount, idTokenHash=$idTokenHash',
    );
    debugPrint('[WhatsAppDebug] appCheckLen=$appCheckLen, appCheckHash=$appCheckHash');

    if (idToken == null || idToken.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('ID token unavailable'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }
    await Clipboard.setData(
      ClipboardData(text: 'ID=$idToken\nAPP=${appCheckToken ?? ''}\n'),
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          appCheckToken == null || appCheckToken.isEmpty
              ? 'Copied ID token (AppCheck unavailable)'
              : 'Copied tokens',
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    _checkAdminAndLoad();
  }

  /// Admin-only (email-only via admin_config). If not admin: Forbidden, no listeners/backfill/timer.
  Future<void> _checkAdminAndLoad() async {
    final email = FirebaseAuth.instance.currentUser?.email ?? '';
    final allowed = email.trim().toLowerCase() == adminEmail.toLowerCase();
    if (kDebugMode) {
      debugPrint('[RBAC] AdminInbox allowed=$allowed email=${email.isEmpty ? 'null' : email}');
    }
    if (!mounted) return;
    setState(() {
      _adminCheckDone = true;
      _forbidden = !allowed;
    });
    if (!allowed) return;
    _loadAccounts();
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (mounted && _accounts.isNotEmpty) {
        final hasConnected = _accounts.any((a) => a['status'] == 'connected');
        if (hasConnected) {
          if (kDebugMode) {
            debugPrint('[WhatsAppInboxScreen] Auto-refresh: refreshing threads (10s interval)');
          }
          _loadThreads(forceRefresh: false);
        }
      }
    });
  }

  bool _isAdminEmail() {
    final email = FirebaseAuth.instance.currentUser?.email ?? '';
    return email.trim().toLowerCase() == adminEmail.toLowerCase();
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = null;
    for (final subscription in _threadSubscriptions.values) {
      subscription.cancel();
    }
    _threadSubscriptions.clear();
    _activeAccountIds = {};
    super.dispose();
  }

  /// Normalize phone number to E164 format (like backend does)
  /// Examples: "+40737571397" -> "+40737571397", "0737571397" -> "+40737571397", "40737571397" -> "+40737571397"
  String? _normalizePhoneToE164(String? phone) {
    if (phone == null || phone.isEmpty) return null;
    // Remove all non-digit characters
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return null;
    
    // If starts with 0 and has 10 digits, replace with +40 (Romanian country code)
    if (digits.startsWith('0') && digits.length == 10) {
      return '+4$digits';
    }
    // If starts with 4 and has 11 digits, add +
    if (digits.startsWith('4') && digits.length == 11) {
      return '+$digits';
    }
    // If already has +, normalize digits but keep +
    if (phone.startsWith('+')) {
      // Extract digits and rebuild with +
      if (digits.startsWith('4') && digits.length == 11) {
        return '+$digits';
      }
      // If digits start with 0 and have 10 digits, convert to +4
      if (digits.startsWith('0') && digits.length == 10) {
        return '+4$digits';
      }
      // Return as is if already in correct format
      return phone;
    }
    // If has 11 digits starting with 4, add +
    if (digits.length == 11 && digits.startsWith('4')) {
      return '+$digits';
    }
    
    if (kDebugMode) {
      debugPrint('[WhatsAppInboxScreen] _normalizePhoneToE164: Could not normalize phone=$phone, digits=$digits');
    }
    return null;
  }

  void _startThreadListeners() {
    // Inbox Admin: only admin phone (0737571397). Uses config/admin_phone.
    final connectedAccounts = _accounts
        .where((account) => account['status'] == 'connected')
        .toList();

    final filteredAccounts = connectedAccounts.where((account) {
      final phone = account['phone'] as String? ?? account['phoneNumber'] as String?;
      return isAdminPhone(phone);
    }).toList();

    final accountsToUse = filteredAccounts;
    final accountIds = accountsToUse
        .map((account) => account['id'])
        .whereType<String>()
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet();

    if (kDebugMode) {
      final statusByAccount = {
        for (final a in accountsToUse) (a['id'] as String? ?? ''): (a['status'] as String? ?? '?')
      };
      debugPrint('[WhatsAppInboxScreen] DEBUG accountsCount=${accountsToUse.length} accountIds=$accountIds statusByAccount=$statusByAccount');
      debugPrint('[WhatsAppInboxScreen] Total accounts: ${_accounts.length}, connected: ${connectedAccounts.length}, filtered (admin phone): ${filteredAccounts.length}');
      if (filteredAccounts.isEmpty) {
        debugPrint('[WhatsAppInboxScreen] No account matching admin phone $adminPhone');
      }
    }

    if (accountIds.length == _activeAccountIds.length &&
        accountIds.containsAll(_activeAccountIds)) {
      return;
    }

    final staleIds =
        _threadSubscriptions.keys.where((id) => !accountIds.contains(id)).toList();
    for (final accountId in staleIds) {
      _threadSubscriptions[accountId]?.cancel();
      _threadSubscriptions.remove(accountId);
      _threadsByAccount.remove(accountId);
    }

    int added = 0;
    for (final accountId in accountIds) {
      if (_threadSubscriptions.containsKey(accountId)) continue;

      final subscription = buildThreadsQuery(accountId).snapshots().listen(
        (snapshot) {
          final accountName = accountsToUse
                  .firstWhere(
                    (account) => account['id'] == accountId,
                    orElse: () => <String, dynamic>{},
                  )['name'] as String? ??
              accountId;
          final threads = snapshot.docs.map((doc) {
            logThreadSchemaAnomalies(doc);
            return {
              'id': doc.id,
              ...doc.data(),
              'accountId': accountId,
              'accountName': accountName,
            };
          }).toList();
          _threadsByAccount[accountId] = threads;
          if (kDebugMode) {
            debugPrint(
                '[WhatsAppInboxScreen] Thread stream update: accountId=$accountId threads=${threads.length}');
            if (threads.isEmpty) {
              debugPrint('[WhatsAppInboxScreen] ⚠️ No threads found for accountId=$accountId');
            }
            if (threads.isNotEmpty) {
              final firstThread = threads[0];
              final lastMessageAt = firstThread['lastMessageAt'];
              final lastMessageText = firstThread['lastMessageText'] ?? firstThread['lastMessagePreview'];
              final idStr = firstThread['id']?.toString() ?? '';
              final msgStr = lastMessageText?.toString() ?? '';
              final idPreview = idStr.length > 20 ? '${idStr.substring(0, 20)}...' : idStr;
              final msgPreview = msgStr.length > 30 ? '${msgStr.substring(0, 30)}...' : msgStr;
              debugPrint(
                  '[WhatsAppInboxScreen] First thread: id=$idPreview lastMessageAt=$lastMessageAt lastMessageText=$msgPreview');
            }
            for (var i = 0; i < 2 && i < threads.length; i++) {
              final t = threads[i];
              final parts = <String>[];
              for (final k in t.keys) {
                final v = t[k];
                final s = v == null ? 'null' : v.toString();
                parts.add(
                    '$k=${s.length > 80 ? '${s.substring(0, 80)}...' : s}');
              }
              debugPrint('[WhatsAppInboxScreen] thread[$i] ${parts.join(' | ')}');
            }
          }
          _rebuildThreadsFromCache();
        },
        onError: (error) {
          debugPrint(
              '[WhatsAppInboxScreen] Thread stream error ($accountId): $error');
          if (error is FirebaseException) {
            debugPrint(
                '[WhatsAppInboxScreen] FirebaseException code=${error.code} message=${error.message}');
          }
        },
        cancelOnError: false,
      );

      _threadSubscriptions[accountId] = subscription;
      added++;
    }

    _activeAccountIds = Set<String>.from(accountIds);
    if (kDebugMode && (staleIds.isNotEmpty || added > 0)) {
      debugPrint(
          '[WhatsAppInboxScreen] Thread listeners updated: active=$accountIds '
          'cancelled=$staleIds added=$added');
    }
  }

  /// Helper: Extract timestamp in milliseconds from thread map
  /// Priority: lastMessageAtMs > lastMessageAt > updatedAt > lastMessageTimestamp
  int threadTimeMs(Map<String, dynamic> t) {
    // Try lastMessageAtMs first (most reliable)
    if (t['lastMessageAtMs'] is int) {
      return t['lastMessageAtMs'] as int;
    }
    
    // Try lastMessageAt (parsed)
    final lastMessageAt = _parseLastMessageAt(t['lastMessageAt']);
    if (lastMessageAt != null) {
      return lastMessageAt.millisecondsSinceEpoch;
    }
    
    // Try updatedAt (parsed)
    final updatedAt = _parseLastMessageAt(t['updatedAt']);
    if (updatedAt != null) {
      return updatedAt.millisecondsSinceEpoch;
    }
    
    // Try lastMessageTimestamp (int)
    if (t['lastMessageTimestamp'] is int) {
      final ts = t['lastMessageTimestamp'] as int;
      // Assume milliseconds if > 1e12, otherwise seconds
      if (ts > 1000000000000) {
        return ts;
      } else if (ts > 1000000000) {
        return ts * 1000;
      }
    }
    
    return 0;
  }

  void _rebuildThreadsFromCache() {
    // RESTORED: Combine all threads from all accounts (original behavior)
    final allThreads = _threadsByAccount.values.expand((list) => list).toList();
    final dedupedMaps = _filterAndDedupeThreads(allThreads);
    
    // CRITICAL FIX: Stable sort with deterministic tie-breaker
    // Use threadId (or id) as tie-breaker instead of index for true stability
    dedupedMaps.sort((a, b) {
      // Get timestamps in milliseconds using robust parser
      final aMs = threadTimeMs(a);
      final bMs = threadTimeMs(b);
      
      // Sort descending by timestamp (newest first)
      final timeCmp = bMs.compareTo(aMs);
      if (timeCmp != 0) return timeCmp;
      
      // STABLE SORT: When timestamps are equal/null, use deterministic tie-breaker
      // Use threadId (or id) for consistent ordering across refreshes
      final aId = (a['id'] ?? a['threadId'] ?? a['clientJid'] ?? '').toString();
      final bId = (b['id'] ?? b['threadId'] ?? b['clientJid'] ?? '').toString();
      final idCmp = aId.compareTo(bId);
      
      // DO NOT return 0 unless both timestamp AND id are equal
      // This ensures stable sort even when timestamps are null/equal
      return idCmp;
    });
    
    final models = dedupedMaps
        .map((m) => ThreadModel.fromJson(m))
        .toList();
    
    if (kDebugMode) {
      debugPrint('[WhatsAppInboxScreen] Rebuild from cache: raw=${allThreads.length} deduped=${models.length} threadsCount=${models.length}');
      if (models.isNotEmpty) {
        final first = models.first;
        final last = models.length > 1 ? models.last : null;
        final firstTimeMs = threadTimeMs(dedupedMaps.first);
        final lastTimeMs = dedupedMaps.length > 1 ? threadTimeMs(dedupedMaps.last) : 0;
        debugPrint('[WhatsAppInboxScreen] ✅ SORTED (stable): First=${first.displayName} (timeMs=$firstTimeMs) | Last=${last?.displayName ?? "N/A"} (timeMs=$lastTimeMs)');
      }
    }
    if (mounted) {
      setState(() {
        _threads = models;
        _isLoadingThreads = false;
      });
    }
  }

  String _readString(dynamic value, {List<String> mapKeys = const []}) {
    if (value is String) return value;
    if (value is Map) {
      for (final key in mapKeys) {
        final nested = value[key];
        if (nested is String) return nested;
      }
    }
    if (value is num) return value.toString();
    return '';
  }

  /// Robust timestamp parser: accepts Firestore Timestamp, Map, ISO string, DateTime, milliseconds int
  /// Handles multiple formats for maximum compatibility
  DateTime? _parseAnyTs(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    
    // CRITICAL FIX: Handle Firestore Timestamp objects from cloud_firestore package
    if (v is Timestamp) {
      return v.toDate();
    }
    
    // Try cloud_firestore Timestamp.toDate() method (best-effort, fără import direct)
    try {
      final dyn = v as dynamic;
      final dt = dyn.toDate?.call();
      if (dt is DateTime) return dt;
    } catch (_) {}
    
    // ISO string
    if (v is String) {
      final parsed = DateTime.tryParse(v);
      if (parsed != null) return parsed;
    }
    
    // Firestore timestamp-like map
    if (v is Map) {
      // Try milliseconds first
      final ms = v['_milliseconds'] ?? v['milliseconds'];
      if (ms is num) {
        return DateTime.fromMillisecondsSinceEpoch(ms.toInt());
      }
      
      // Try seconds
      final secs = v['_seconds'] ?? v['seconds'] ?? v['sec'];
      if (secs is num) {
        return DateTime.fromMillisecondsSinceEpoch(secs.toInt() * 1000);
      }
    }
    
    // int: milliseconds (13 digits) or seconds (10 digits)
    if (v is int) {
      // milliseconds (13 digits-ish, > 1e12)
      if (v > 1000000000000) {
        return DateTime.fromMillisecondsSinceEpoch(v);
      }
      // seconds (10 digits-ish, > 1e9)
      if (v > 1000000000) {
        return DateTime.fromMillisecondsSinceEpoch(v * 1000);
      }
    }
    
    return null;
  }
  
  /// Parse lastMessageAt from thread map with all fallbacks
  DateTime? _parseLastMessageAt(dynamic v) {
    // Try direct parse first
    final parsed = _parseAnyTs(v);
    if (parsed != null) return parsed;
    
    // Additional fallbacks if v is a Map
    if (v is Map) {
      // Try lastMessageAtMs
      if (v['lastMessageAtMs'] is int) {
        return DateTime.fromMillisecondsSinceEpoch(v['lastMessageAtMs'] as int);
      }
      // Try lastMessageTimestamp
      if (v['lastMessageTimestamp'] is int) {
        final ts = v['lastMessageTimestamp'] as int;
        if (ts > 1000000000000) {
          return DateTime.fromMillisecondsSinceEpoch(ts);
        } else if (ts > 1000000000) {
          return DateTime.fromMillisecondsSinceEpoch(ts * 1000);
        }
      }
    }
    
    return null;
  }

  List<Map<String, dynamic>> _filterAndDedupeThreads(List<Map<String, dynamic>> allThreads) {

    DateTime? resolveThreadTime(Map<String, dynamic> thread) {
      // Try lastMessageAt first, then updatedAt as fallback
      final lastMessageAt = _parseAnyTs(thread['lastMessageAt']) ?? _parseAnyTs(thread['updatedAt']);
      if (lastMessageAt != null) return lastMessageAt;
      
      // Fallback to other timestamp fields
      if (thread['lastMessageAtMs'] is int) {
        return DateTime.fromMillisecondsSinceEpoch(thread['lastMessageAtMs'] as int);
      }
      if (thread['lastMessageTimestamp'] is int) {
        final ts = thread['lastMessageTimestamp'] as int;
        // Assume milliseconds if > 1e12, otherwise seconds
        if (ts > 1e12) {
          return DateTime.fromMillisecondsSinceEpoch(ts);
        } else {
          return DateTime.fromMillisecondsSinceEpoch(ts * 1000);
        }
      }
      return null;
    }

    final visibleThreads = allThreads.where((thread) {
      final hidden = thread['hidden'] == true || thread['archived'] == true;
      final redirectTo = _readString(thread['redirectTo']).trim();
      final canonicalThreadId = _readString(thread['canonicalThreadId']).trim();
      final clientJid = _readString(
        thread['clientJid'],
        mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
      ).trim();
      final tid = _readString(thread['id']).trim();
      final isLid = clientJid.endsWith('@lid');
      final isBroadcast = clientJid.endsWith('@broadcast');
      if (hidden) return false;
      if (redirectTo.isNotEmpty) return false;
      if (isLid && canonicalThreadId.isNotEmpty) return false;
      if (isBroadcast) return false;
      if (tid.contains('[object Object]') || tid.contains('[obiect Obiect]')) return false;
      return true;
    }).toList();

    // OPTIMIZATION: Firestore already sorts by lastMessageAt, so we only need to sort
    // threads without timestamps to the end (they come unsorted from Firestore)
    // This is much faster than full sort on all threads
    final threadsWithTime = <Map<String, dynamic>>[];
    final threadsWithoutTime = <Map<String, dynamic>>[];
    for (final thread in visibleThreads) {
      if (resolveThreadTime(thread) != null) {
        threadsWithTime.add(thread);
      } else {
        threadsWithoutTime.add(thread);
      }
    }
    // Threads with timestamps are already sorted by Firestore (orderBy lastMessageAt desc)
    // Only sort threads without timestamps by ID for stability
    threadsWithoutTime.sort((a, b) {
      return (b['id'] ?? '').toString().compareTo((a['id'] ?? '').toString());
    });
    // Combine: threads with time (already sorted) + threads without time
    final sortedThreads = [...threadsWithTime, ...threadsWithoutTime];

    // OPTIMIZATION: Deduplicate while preserving order from sortedThreads
    final dedupedByPhone = <String, Map<String, dynamic>>{};
    for (final thread in sortedThreads) {
      final normalizedPhone = _readString(thread['normalizedPhone']).trim();
      final canonicalThreadId = _readString(thread['canonicalThreadId']).trim();
      final clientJid = _readString(
        thread['clientJid'],
        mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
      ).trim();
      final threadId =
          _readString(thread['id'], mapKeys: const ['threadId', 'id']).trim();
      final jidPhone = _extractPhoneFromJid(clientJid);
      final phoneKey =
          (normalizedPhone.isNotEmpty && jidPhone != null && normalizedPhone == jidPhone)
              ? normalizedPhone
              : null;
      final key = canonicalThreadId.isNotEmpty
          ? canonicalThreadId
          : (threadId.isNotEmpty ? threadId : (phoneKey ?? clientJid));
      final existing = dedupedByPhone[key];
      if (existing == null) {
        dedupedByPhone[key] = thread;
        continue;
      }

      int scoreThread(Map<String, dynamic> t) {
        final jid = _readString(
          t['clientJid'],
          mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
        ).trim();
        final isLid = jid.endsWith('@lid');
        final displayName = _readString(t['displayName']).trim();
        final phone = _readString(t['normalizedPhone']).trim();
        final inferredPhone = _extractPhoneFromJid(jid);
        final hasName = displayName.isNotEmpty && !_looksLikePhone(displayName);
        final hasPhone = phone.isNotEmpty || (inferredPhone != null && inferredPhone.isNotEmpty);
        final hasLastMessage = _readString(
          t['lastMessageText'],
          mapKeys: const ['lastMessagePreview', 'lastMessageBody', 'lastMessage'],
        ).trim().isNotEmpty;
        final hasTimestamp = resolveThreadTime(t) != null;
        var score = 0;
        if (!isLid) score += 4;
        if (hasName) score += 3;
        if (hasPhone) score += 2;
        if (hasTimestamp) score += 1;
        if (hasLastMessage) score += 1;
        return score;
      }

      final existingScore = scoreThread(existing);
      final currentScore = scoreThread(thread);
      if (currentScore > existingScore) {
        dedupedByPhone[key] = thread;
        continue;
      }
      if (currentScore == existingScore) {
        final existingTime = resolveThreadTime(existing);
        final currentTime = resolveThreadTime(thread);
        if (existingTime == null && currentTime != null) {
          dedupedByPhone[key] = thread;
        } else if (existingTime != null &&
            currentTime != null &&
            currentTime.isAfter(existingTime)) {
          dedupedByPhone[key] = thread;
        }
      }
    }
    // OPTIMIZATION: Convert map values to list while preserving insertion order
    // Since we iterate sortedThreads in order, dedupedByPhone preserves that order
    // Dart Map preserves insertion order, so values.toList() maintains chronological order
    final dedupedList = dedupedByPhone.values.toList();
    return dedupedList;
  }

  /// Refresh thread list from Firestore cache only (no HTTP). Threads come from
  /// Firestore listeners; this just rebuilds/sorts from _threadsByAccount.
  /// If forceRefresh is true, re-subscribe listeners to force Firestore to send latest data.
  Future<void> _loadThreads({bool forceRefresh = false}) async {
    if (forceRefresh) {
      // Force re-subscribe to Firestore listeners to get latest data
      // This ensures we get updates even if listener didn't trigger automatically
      if (kDebugMode) {
        debugPrint('[WhatsAppInboxScreen] Force refresh: re-subscribing listeners');
      }
      // Cancel existing listeners
      for (final subscription in _threadSubscriptions.values) {
        subscription.cancel();
      }
      _threadSubscriptions.clear();
      _threadsByAccount.clear();
      _activeAccountIds.clear();
      // Re-subscribe listeners
      _startThreadListeners();
      // Wait a bit for Firestore to send initial data
      await Future.delayed(const Duration(milliseconds: 500));
    }
    _rebuildThreadsFromCache();
  }

  Future<void> _loadAccounts() async {
    setState(() => _isLoadingAccounts = true);
    _errorMessage = null;

    try {
      if (kDebugMode) {
        debugPrint('[WhatsAppInboxScreen] Loading accounts via getAccounts...');
      }
      
      final response = await _apiService.getAccounts();
      
      if (kDebugMode) {
        debugPrint('[WhatsAppInboxScreen] getAccounts response: success=${response['success']}, accountsCount=${(response['accounts'] as List?)?.length ?? 0}');
      }
      
      if (response['success'] == true) {
        final accounts = (response['accounts'] as List<dynamic>? ?? [])
            .cast<Map<String, dynamic>>();

        if (kDebugMode) {
          debugPrint('[WhatsAppInboxScreen] Loaded ${accounts.length} accounts');
          for (final acc in accounts) {
            final phone = acc['phone'] as String?;
            final normalized = _normalizePhoneToE164(phone);
            debugPrint('[WhatsAppInboxScreen] Account: id=${acc['id']}, phone=$phone, normalized=$normalized, status=${acc['status']}');
          }
        }

        if (mounted) {
          setState(() {
            _accounts = accounts;
            _isLoadingAccounts = false;
            _isLoadingThreads = accounts.isNotEmpty;
            _errorMessage = null;
          });
          _startThreadListeners();
          if (accounts.isEmpty) {
            setState(() {
              _threads = <ThreadModel>[];
              _isLoadingThreads = false;
            });
          }
          
          // Auto-backfill: sync old messages on first load (only once per session)
          if (!_hasRunAutoBackfill) {
            _hasRunAutoBackfill = true;
            // Run backfill in background (don't block UI)
            _runBackfill().catchError((e) {
              if (kDebugMode) {
                debugPrint('[WhatsAppInboxScreen] Auto-backfill failed: $e');
              }
              // Silently fail - user can manually trigger backfill if needed
            });
          }
        }
      } else {
        final errorMsg = response['message'] as String? ?? 'Failed to load accounts';
        if (kDebugMode) {
          debugPrint('[WhatsAppInboxScreen] getAccounts failed: $errorMsg');
        }
        if (mounted) {
          setState(() {
            _isLoadingAccounts = false;
            _errorMessage = errorMsg;
          });
        }
      }
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint('[WhatsAppInboxScreen] Error loading accounts: $e');
        if (e.toString().toLowerCase().contains('timeout')) {
          debugPrint('[WhatsAppInboxScreen] timeout');
        }
        debugPrint('[WhatsAppInboxScreen] Stack trace: $stackTrace');
      }
      if (mounted) {
        setState(() {
          _isLoadingAccounts = false;
          _errorMessage = 'Eroare la încărcarea conturilor: ${e.toString()}';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error loading accounts: $e'),
            backgroundColor: Colors.red[700],
          ),
        );
      }
    }
  }

  Future<void> _runBackfill() async {
    if (FirebaseAuth.instance.currentUser == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Trebuie să fii autentificat.')),
      );
      return;
    }
    if (!_isAdminEmail()) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Doar admin. Backfill restricționat.')),
      );
      return;
    }
    
    final connected = _accounts
        .where((a) {
          final phone = a['phone'] as String? ?? a['phoneNumber'] as String?;
          return a['status'] == 'connected' && isAdminPhone(phone);
        })
        .map((a) => a['id'] as String?)
        .whereType<String>()
        .toList();

    if (connected.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contul admin nu este conectat pentru backfill.')),
      );
      return;
    }
    final accountId = connected.first;
    if (_isBackfilling) return;
    setState(() => _isBackfilling = true);
    try {
      final res = await _apiService.backfillAccount(accountId: accountId);
      if (kDebugMode) {
        debugPrint('[WhatsAppInbox] backfill success: $res');
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Backfill pornit. Reîmprospătare liste…')),
      );
      _startThreadListeners();
      _rebuildThreadsFromCache();
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('[WhatsAppInbox] backfill error: $e');
        debugPrint('[WhatsAppInbox] backfill stackTrace: $st');
      }
      if (!mounted) return;
      String msg;
      if (e is UnauthorizedException || e is ForbiddenException) {
        msg = 'Necesită super-admin.';
      } else {
        msg = e.toString();
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: Colors.red[700]),
      );
    } finally {
      if (mounted) setState(() => _isBackfilling = false);
    }
  }

  String? _extractPhoneFromJid(String? jid) {
    if (jid == null) return null;
    if (jid.contains('@lid') || jid.contains('@broadcast')) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0];
    if (digits.length > 15 || !RegExp(r'^\d{6,15}$').hasMatch(digits)) return null;
    return '+$digits';
  }

  bool _looksLikePhone(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return false;
    if (trimmed.contains('@')) return true;
    return RegExp(r'^\+?[\d\s\-\(\)]{6,}$').hasMatch(trimmed);
  }

  /// Sanitize string for Text widgets (avoids "string is not well-formed UTF-16").
  String _sanitizeForDisplay(String s) {
    if (s.isEmpty) return s;
    final sb = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      final c = s.codeUnitAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        if (i + 1 < s.length) {
          final n = s.codeUnitAt(i + 1);
          if (n >= 0xDC00 && n <= 0xDFFF) {
            sb.writeCharCode(c);
            sb.writeCharCode(n);
            i++;
            continue;
          }
        }
        continue;
      }
      if (c >= 0xDC00 && c <= 0xDFFF) continue;
      sb.writeCharCode(c);
    }
    return sb.toString();
  }

  /// True when thread has no real name/phone (we'd show "Contact"/"Grup"/"Conversație").
  bool _isPlaceholderOnly(ThreadModel t) {
    final name = t.displayName.trim();
    final ph = (t.normalizedPhone ?? t.phone ?? '').trim();
    return name.isEmpty && ph.isEmpty;
  }

  /// Fallback only when both displayName and phone are empty (removes blank titles).
  String _threadTitleFallback(ThreadModel t) {
    final jid = t.clientJid;
    if (jid.isEmpty) return 'Conversație';
    final parts = jid.split('@');
    final local = parts.isNotEmpty ? parts[0] : '';
    if (local.isEmpty) return 'Conversație';
    if (jid.endsWith('@g.us')) return 'Grup';
    if (jid.contains('@lid')) return 'Contact';
    return local.length > 20 ? '${local.substring(0, 17)}…' : local;
  }

  /// Check if displayName looks like a protocol message or system message
  /// These should be filtered out or replaced with fallback
  bool _looksLikeProtocolMessage(String displayName) {
    final trimmed = displayName.trim().toUpperCase();
    if (trimmed.isEmpty) return false;
    
    // Check for common protocol message patterns
    if (trimmed.startsWith('INBOUND-PROBE') || 
        trimmed.startsWith('INBOUND_PROBE') ||
        trimmed.startsWith('OUTBOUND-PROBE') ||
        trimmed.startsWith('OUTBOUND_PROBE') ||
        trimmed.startsWith('PROTOCOL') ||
        trimmed.startsWith('HISTORY-SYNC') ||
        trimmed.startsWith('HISTORY_SYNC')) {
      return true;
    }
    
    // Check for system message patterns (long alphanumeric strings with underscores/hyphens)
    if (RegExp(r'^[A-Z0-9_-]{20,}$').hasMatch(trimmed) && 
        (trimmed.contains('_') || trimmed.contains('-'))) {
      return true;
    }
    
    return false;
  }

  /// Open WhatsApp chat for calling (user must press Call button in WhatsApp)
  Future<bool> _openWhatsAppForCall(String? phoneE164) async {
    if (phoneE164 == null || phoneE164.isEmpty) return false;
    
    // Normalize: digits + optional leading +
    var cleaned = phoneE164.trim().replaceAll(RegExp(r'[^\d+]'), '');
    final hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replaceAll('+', '');
    if (cleaned.isEmpty) return false;
    final e164 = hasPlus ? '+$cleaned' : cleaned;

    // 1) Native scheme (opens app)
    final native = Uri.parse('whatsapp://send?phone=$e164');
    if (await canLaunchUrl(native)) {
      return launchUrl(native, mode: LaunchMode.externalApplication);
    }

    // 2) Web fallback
    final waDigits = e164.startsWith('+') ? e164.substring(1) : e164;
    final web = Uri.parse('https://wa.me/$waDigits');
    return launchUrl(web, mode: LaunchMode.externalApplication);
  }

  /// Make phone call using url_launcher
  Future<void> _makePhoneCall(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    
    // Clean phone number: normalize to have + only at the beginning
    String cleaned = phone.trim();
    // Remove all non-digit characters except +
    cleaned = cleaned.replaceAll(RegExp(r'[^\d+]'), '');
    // Ensure + is only at the beginning (remove any + in the middle/end)
    final hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replaceAll('+', ''); // Remove all +
    if (hasPlus && cleaned.isNotEmpty) {
      cleaned = '+$cleaned'; // Add + only at the beginning
    }
    
    if (cleaned.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Număr de telefon invalid')),
      );
      return;
    }
    
    final uri = Uri(scheme: 'tel', path: cleaned);
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nu se poate deschide aplicația de telefon')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Eroare la apelare: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_adminCheckDone) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('WhatsApp Inbox'),
          backgroundColor: const Color(0xFF25D366),
          leading: IconButton(
            icon: const Icon(Icons.home, color: Colors.white),
            onPressed: () => context.go('/home'),
            tooltip: 'Acasă',
          ),
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_forbidden) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('WhatsApp Inbox'),
          backgroundColor: const Color(0xFF25D366),
          leading: IconButton(
            icon: const Icon(Icons.home, color: Colors.white),
            onPressed: () => context.go('/home'),
            tooltip: 'Acasă',
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.block, size: 64, color: Colors.red[700]),
                const SizedBox(height: 16),
                Text(
                  'Acces interzis. Doar admin.',
                  style: TextStyle(fontSize: 18, color: Colors.red[700]),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => context.go('/home'),
                  child: const Text('Înapoi'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Debug: Show backend URL in debug mode
    final backendUrl = Env.whatsappBackendUrl;
    
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.home, color: Colors.white),
          onPressed: () => context.go('/home'),
          tooltip: 'Acasă',
        ),
        title: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('WhatsApp Inbox'),
            if (kDebugMode && backendUrl.isNotEmpty)
              Text(
                backendUrl,
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.normal),
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            onPressed: () async {
              // Sync messages from phone - run backfill to get latest messages
              await _runBackfill();
              // Also refresh threads list
              _loadThreads(forceRefresh: true);
            },
            tooltip: 'Sincronizează mesaje',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              // Only reload threads (accounts are loaded once, threads come from Firestore streams)
              // _loadAccounts() already calls _startThreadListeners() which triggers rebuild
              _loadThreads(forceRefresh: true);
            },
            tooltip: 'Refresh',
          ),
          if (kDebugMode)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (value) async {
                if (value == 'copy_auth_tokens') {
                  _copyAuthTokensToClipboard();
                } else if (value == 'diagnostics') {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const WhatsAppDiagnosticsScreen(),
                    ),
                  );
                } else if (value == 'sync_backfill') {
                  await _runBackfill();
                }
              },
              itemBuilder: (context) {
                return [
                  const PopupMenuItem(
                    value: 'copy_auth_tokens',
                    child: Text('Copy Auth Tokens'),
                  ),
                  const PopupMenuItem(
                    value: 'diagnostics',
                    child: Text('Diagnostics'),
                  ),
                  PopupMenuItem(
                    value: 'sync_backfill',
                    enabled: !_isBackfilling,
                    child: const Row(
                      children: [
                        Icon(Icons.sync, size: 20),
                        SizedBox(width: 8),
                        Text('Sync / Backfill history'),
                      ],
                    ),
                  ),
                ];
              },
            ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search by phone or name...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) {
                setState(() => _searchQuery = value.toLowerCase());
              },
            ),
          ),

          // Threads list - all conversations from all accounts
          Expanded(
            child: (_isLoadingThreads && _threads.isEmpty)
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            CircularProgressIndicator(),
                            SizedBox(height: 16),
                            Text('Loading conversations...', style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      )
                    : _errorMessage != null
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  _errorMessage!,
                                  style: TextStyle(color: Colors.red[700]),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 16),
                                ElevatedButton(
                                  onPressed: () => _loadThreads(forceRefresh: true),
                                  child: const Text('Retry'),
                                ),
                              ],
                            ),
                          )
                            : _threads.isEmpty
                            ? Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      const Text('No conversations yet'),
                                      const SizedBox(height: 12),
                                      Text(
                                        'Backfill only fills existing threads. For new ones: re-pair the account (QR) in Manage Accounts or send/receive messages on WhatsApp.',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                                      ),
                                      const SizedBox(height: 16),
                                      ElevatedButton.icon(
                                        onPressed: () async {
                                          await _loadAccounts();
                                          await _loadThreads(forceRefresh: true);
                                        },
                                        icon: const Icon(Icons.refresh),
                                        label: const Text('Refresh'),
                                      ),
                                    ],
                                  ),
                                ),
                              )
                            : Builder(
                                builder: (context) {
                                  final q = _searchQuery.toLowerCase();
                                  var base = q.isEmpty
                                      ? _threads
                                      : _threads.where((t) {
                                          final jid = t.clientJid.toLowerCase();
                                          final name = t.displayName.toLowerCase();
                                          final msg = t.lastMessageText.toLowerCase();
                                          final ph = (t.phone ?? '').toLowerCase();
                                          return jid.contains(q) ||
                                              name.contains(q) ||
                                              msg.contains(q) ||
                                              ph.contains(q);
                                        }).toList();
                                  final filtered = base.where((t) => !_isPlaceholderOnly(t)).toList();
                                  // Sort strictly newest-first (like WhatsApp): last message time desc, then threadId
                                  filtered.sort((a, b) {
                                    final aT = a.lastMessageAt;
                                    final bT = b.lastMessageAt;
                                    if (aT == null && bT == null) return a.threadId.compareTo(b.threadId);
                                    if (aT == null) return 1;
                                    if (bT == null) return -1;
                                    final aMs = aT.millisecondsSinceEpoch;
                                    final bMs = bT.millisecondsSinceEpoch;
                                    final c = bMs.compareTo(aMs);
                                    if (c != 0) return c;
                                    return a.threadId.compareTo(b.threadId);
                                  });

                                  if (filtered.isEmpty) {
                                    return Center(
                                      child: Text(
                                        q.isEmpty
                                            ? 'Nicio conversație cu nume sau număr. Reîmperechează contul pentru a importa contactele.'
                                            : 'No conversations match search query',
                                      ),
                                    );
                                  }

                                  return RefreshIndicator(
                                    onRefresh: () async {
                                      await _loadThreads(forceRefresh: true);
                                    },
                                    child: ListView.builder(
                                      itemCount: filtered.length,
                                      itemBuilder: (context, index) {
                                        final t = filtered[index];
                                        final effectiveThreadId = (t.redirectTo ?? '').isNotEmpty
                                            ? t.redirectTo!
                                            : ((t.canonicalThreadId ?? '').isNotEmpty
                                                ? t.canonicalThreadId!
                                                : t.threadId);
                                        String timeText = '';
                                        if (t.lastMessageAt != null) {
                                          final now = DateTime.now();
                                          final diff = now.difference(t.lastMessageAt!);
                                          if (diff.inMinutes < 60) {
                                            timeText = '${diff.inMinutes}m ago';
                                          } else if (diff.inHours < 24) {
                                            timeText = '${diff.inHours}h ago';
                                          } else if (diff.inDays < 7) {
                                            timeText = DateFormat('EEE').format(t.lastMessageAt!);
                                          } else {
                                            timeText = DateFormat('dd/MM').format(t.lastMessageAt!);
                                          }
                                        }
                                        // Use normalizedPhone first, then fallback to phone getter
                                        final ph = (t.normalizedPhone ?? t.phone ?? '').trim();
                                        final showPhone = ph.isNotEmpty &&
                                            (t.displayName.trim().isEmpty ||
                                                t.displayName.trim() == ph ||
                                                RegExp(r'^\+?[\d\s\-\(\)]+$').hasMatch(t.displayName.trim()));
                                        final subtitleParts = <String>[];
                                        if (showPhone) subtitleParts.add(ph);
                                        if (t.lastMessageText.trim().isNotEmpty) {
                                          if (subtitleParts.isNotEmpty) subtitleParts.add('•');
                                          subtitleParts.add(t.lastMessageText.trim());
                                        }
                                        final subtitle = subtitleParts.isEmpty
                                            ? (ph.isNotEmpty ? ph : 'Fără mesaje')
                                            : subtitleParts.join(' ');

                                        return ListTile(
                                          leading: t.profilePictureUrl != null &&
                                                  t.profilePictureUrl!.isNotEmpty
                                              ? CircleAvatar(
                                                  backgroundImage: CachedNetworkImageProvider(
                                                    t.profilePictureUrl!,
                                                  ),
                                                  onBackgroundImageError: (_, __) {},
                                                )
                                              : CircleAvatar(
                                                  backgroundColor: const Color(0xFF25D366),
                                                  child: Text(
                                                    _sanitizeForDisplay(t.initial).isEmpty ? '?' : _sanitizeForDisplay(t.initial),
                                                    style: const TextStyle(color: Colors.white),
                                                  ),
                                                ),
                                          title: Row(
                                            children: [
                                              Expanded(
                                                flex: 3,
                                                child: Text(
                                                  _sanitizeForDisplay(() {
                                                    if (t.displayName.trim().isNotEmpty && _looksLikeProtocolMessage(t.displayName)) {
                                                      final ph = (t.normalizedPhone ?? t.phone ?? '').trim();
                                                      if (ph.isNotEmpty) return ph;
                                                      final jid = t.clientJid;
                                                      if (jid.isNotEmpty) {
                                                        final phoneFromJid = _extractPhoneFromJid(jid);
                                                        final x = (phoneFromJid ?? (jid.split('@').isNotEmpty ? jid.split('@')[0] : '')).trim();
                                                        return x.isEmpty ? _threadTitleFallback(t) : x;
                                                      }
                                                      return _threadTitleFallback(t);
                                                    }
                                                    final label = t.displayName.trim().isNotEmpty
                                                        ? t.displayName.trim()
                                                        : (t.normalizedPhone ?? t.phone ?? '').trim();
                                                    return label.isEmpty ? _threadTitleFallback(t) : label;
                                                  }()),
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                  ),
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ),
                                              if ((t.accountName ?? '').isNotEmpty) ...[
                                                const SizedBox(width: 4),
                                                Flexible(
                                                  flex: 1,
                                                  child: Container(
                                                    padding: const EdgeInsets.symmetric(
                                                      horizontal: 4,
                                                      vertical: 2,
                                                    ),
                                                    decoration: BoxDecoration(
                                                      color: Colors.blue[100],
                                                      borderRadius:
                                                          BorderRadius.circular(4),
                                                    ),
                                                    child: Text(
                                                      _sanitizeForDisplay(t.accountName!),
                                                      style: TextStyle(
                                                        fontSize: 9,
                                                        color: Colors.blue[800],
                                                        fontWeight: FontWeight.w500,
                                                      ),
                                                      overflow: TextOverflow.ellipsis,
                                                      maxLines: 1,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ],
                                          ),
                                          subtitle: Text(
                                            _sanitizeForDisplay(subtitle),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontSize: 13),
                                          ),
                                          trailing: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              if (timeText.isNotEmpty)
                                                Text(
                                                  _sanitizeForDisplay(timeText),
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    color: Colors.grey[600],
                                                  ),
                                                ),
                                              if (ph.isNotEmpty) ...[
                                                if (timeText.isNotEmpty) const SizedBox(width: 8),
                                                // WhatsApp call button
                                                IconButton(
                                                  icon: const Icon(Icons.video_call, color: Color(0xFF25D366), size: 18),
                                                  onPressed: () async {
                                                    final ok = await _openWhatsAppForCall(ph);
                                                    if (!mounted) return;
                                                    ScaffoldMessenger.of(context).showSnackBar(
                                                      SnackBar(
                                                        content: Text(ok
                                                            ? 'S-a deschis WhatsApp. Apasă iconița Call acolo.'
                                                            : 'Nu pot deschide WhatsApp (instalat?)'),
                                                        duration: const Duration(seconds: 2),
                                                      ),
                                                    );
                                                  },
                                                  tooltip: 'Sună pe WhatsApp',
                                                  padding: EdgeInsets.zero,
                                                  constraints: const BoxConstraints(
                                                    minWidth: 32,
                                                    minHeight: 32,
                                                  ),
                                                  iconSize: 18,
                                                ),
                                                const SizedBox(width: 4),
                                                // Regular phone call button
                                                IconButton(
                                                  icon: const Icon(Icons.phone, color: Colors.blue, size: 18),
                                                  onPressed: () => _makePhoneCall(ph),
                                                  tooltip: 'Sună ${ph} (telefon)',
                                                  padding: EdgeInsets.zero,
                                                  constraints: const BoxConstraints(
                                                    minWidth: 32,
                                                    minHeight: 32,
                                                  ),
                                                  iconSize: 18,
                                                ),
                                              ],
                                            ],
                                          ),
                                          onTap: () {
                                            context.go(
                                              '/whatsapp/chat?accountId=${Uri.encodeComponent(t.accountId ?? '')}'
                                              '&threadId=${Uri.encodeComponent(effectiveThreadId)}'
                                              '&clientJid=${Uri.encodeComponent(t.clientJid)}'
                                              '&phoneE164=${Uri.encodeComponent(ph)}'
                                              '&displayName=${Uri.encodeComponent(t.displayName)}',
                                            );
                                          },
                                        );
                                      },
                                    ),
                                  );
                                },
                              ),
          ),
        ],
      ),
    );
  }
}
