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
import '../../models/thread_model.dart';
import '../../services/whatsapp_api_service.dart';
import '../debug/whatsapp_diagnostics_screen.dart';
import 'package:cached_network_image/cached_network_image.dart';

/// Staff Inbox Screen - Identical to WhatsAppInboxScreen but excludes account with phone 0737571397
/// Shows conversations from all connected accounts EXCEPT the excluded phone number
class StaffInboxScreen extends StatefulWidget {
  const StaffInboxScreen({super.key});

  @override
  State<StaffInboxScreen> createState() => _StaffInboxScreenState();
}

class _StaffInboxScreenState extends State<StaffInboxScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;

  // Phone number to exclude: 0737571397 (normalized to digits only: 40737571397)
  static const String _excludedPhoneDigits = '40737571397';

  List<Map<String, dynamic>> _accounts = [];
  bool _isBackfilling = false;
  bool _isLoadingAccounts = true;
  bool _isLoadingThreads = false;
  String _searchQuery = '';
  List<ThreadModel> _threads = [];
  String? _errorMessage;
  
  // Firestore thread streams (per account)
  final Map<String, StreamSubscription<QuerySnapshot>> _threadSubscriptions = {};
  final Map<String, List<Map<String, dynamic>>> _threadsByAccount = {};
  Set<String> _activeAccountIds = {};
  
  // Auto-refresh timer: refresh threads every 10 seconds to catch new messages
  Timer? _autoRefreshTimer;

  /// Normalize phone number to digits only (like backend does)
  /// Examples: "+40737571397" -> "40737571397", "0737571397" -> "40737571397", "40737571397" -> "40737571397"
  String _normalizePhoneToDigits(String? phone) {
    if (phone == null || phone.isEmpty) return '';
    // Remove all non-digit characters
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return '';
    
    // If starts with 0 and has 10 digits, replace with 4 (Romanian country code)
    if (digits.startsWith('0') && digits.length == 10) {
      return '4$digits';
    }
    
    // If already starts with 4 and has 11 digits, return as is
    if (digits.startsWith('4') && digits.length == 11) {
      return digits;
    }
    
    // If has 11 digits but doesn't start with 4, might be missing country code
    // But we'll return as is to avoid false matches
    return digits;
  }

  /// Check if account should be excluded (phone matches excluded number)
  bool _shouldExcludeAccount(Map<String, dynamic> account) {
    final phone = account['phone'] as String? ?? '';
    final normalized = _normalizePhoneToDigits(phone);
    final shouldExclude = normalized == _excludedPhoneDigits;
    
    if (kDebugMode) {
      debugPrint('[StaffInboxScreen] _shouldExcludeAccount: phone=$phone, normalized=$normalized, excluded=$shouldExclude, target=$_excludedPhoneDigits');
    }
    
    return shouldExclude;
  }

  Future<void> _copyAuthTokensToClipboard() async {
    if (!kDebugMode) return;
    final idToken = await FirebaseAuth.instance.currentUser?.getIdToken(true);
    String? appCheckToken;
    try {
      appCheckToken = await FirebaseAppCheck.instance.getToken(true);
    } catch (e) {
      appCheckToken = null;
      debugPrint('[StaffInboxScreen] appCheckToken error: ${e.runtimeType}');
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
      '[StaffInboxScreen] idTokenLen=$idTokenLen, idTokenDotCount=$idTokenDotCount, idTokenHash=$idTokenHash',
    );
    debugPrint('[StaffInboxScreen] appCheckLen=$appCheckLen, appCheckHash=$appCheckHash');

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
    _loadAccounts();
    // Start auto-refresh timer: refresh threads every 10 seconds
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (mounted && _accounts.isNotEmpty) {
        // Only refresh if we have connected accounts
        final hasConnected = _accounts.any((a) => a['status'] == 'connected');
        if (hasConnected) {
          if (kDebugMode) {
            debugPrint('[StaffInboxScreen] Auto-refresh: refreshing threads (10s interval)');
          }
          _loadThreads(forceRefresh: false); // Force refresh to re-subscribe listeners
        }
      }
    });
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

  void _startThreadListeners() {
    // Filter accounts: only connected accounts, excluding the one with phone 0737571397
    final connectedAccounts = _accounts
        .where((account) => account['status'] == 'connected')
        .toList();
    
    final allowedAccounts = connectedAccounts.where((account) {
      return !_shouldExcludeAccount(account);
    }).toList();
    
    if (kDebugMode) {
      debugPrint('[StaffInboxScreen] Total accounts: ${_accounts.length}');
      debugPrint('[StaffInboxScreen] Connected accounts: ${connectedAccounts.length}');
      debugPrint('[StaffInboxScreen] Allowed accounts (excluding personal): ${allowedAccounts.length}');
      for (final acc in connectedAccounts) {
        final phone = acc['phone'] as String?;
        final normalized = _normalizePhoneToDigits(phone);
        final excluded = _shouldExcludeAccount(acc);
        debugPrint('[StaffInboxScreen] Account: id=${acc['id']}, phone=$phone, normalized=$normalized, excluded=$excluded');
      }
    }

    final accountIds = allowedAccounts
        .map((account) => account['id'])
        .whereType<String>()
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet();

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

      final subscription = FirebaseFirestore.instance
          .collection('threads')
          .where('accountId', isEqualTo: accountId)
          .orderBy('lastMessageAt', descending: true)
          .limit(200)
          .snapshots()
          .listen(
        (snapshot) {
          final accountName = allowedAccounts
                  .firstWhere(
                    (account) => account['id'] == accountId,
                    orElse: () => <String, dynamic>{},
                  )['name'] as String? ??
              accountId;
          final threads = snapshot.docs.map((doc) {
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
                '[StaffInboxScreen] Thread stream update: accountId=$accountId threads=${threads.length}');
          }
          _rebuildThreadsFromCache();
        },
        onError: (error) {
          debugPrint(
              '[StaffInboxScreen] Thread stream error ($accountId): $error');
        },
        cancelOnError: false,
      );

      _threadSubscriptions[accountId] = subscription;
      added++;
    }

    _activeAccountIds = Set<String>.from(accountIds);
    if (kDebugMode && (staleIds.isNotEmpty || added > 0)) {
      debugPrint(
          '[StaffInboxScreen] Thread listeners updated: active=$accountIds '
          'cancelled=$staleIds added=$added');
    }
  }

  /// Helper: Extract timestamp in milliseconds from thread map
  int threadTimeMs(Map<String, dynamic> t) {
    if (t['lastMessageAtMs'] is int) {
      return t['lastMessageAtMs'] as int;
    }
    
    final lastMessageAt = _parseLastMessageAt(t['lastMessageAt']);
    if (lastMessageAt != null) {
      return lastMessageAt.millisecondsSinceEpoch;
    }
    
    final updatedAt = _parseLastMessageAt(t['updatedAt']);
    if (updatedAt != null) {
      return updatedAt.millisecondsSinceEpoch;
    }
    
    if (t['lastMessageTimestamp'] is int) {
      final ts = t['lastMessageTimestamp'] as int;
      if (ts > 1000000000000) {
        return ts;
      } else if (ts > 1000000000) {
        return ts * 1000;
      }
    }
    
    return 0;
  }

  void _rebuildThreadsFromCache() {
    // Combine all threads from all allowed accounts (excluding excluded phone)
    final allThreads = _threadsByAccount.values.expand((list) => list).toList();
    final dedupedMaps = _filterAndDedupeThreads(allThreads);
    
    // Stable sort with deterministic tie-breaker
    dedupedMaps.sort((a, b) {
      final aMs = threadTimeMs(a);
      final bMs = threadTimeMs(b);
      
      final timeCmp = bMs.compareTo(aMs);
      if (timeCmp != 0) return timeCmp;
      
      final aId = (a['id'] ?? a['threadId'] ?? a['clientJid'] ?? '').toString();
      final bId = (b['id'] ?? b['threadId'] ?? b['clientJid'] ?? '').toString();
      return aId.compareTo(bId);
    });
    
    final models = dedupedMaps
        .map((m) => ThreadModel.fromJson(m))
        .toList();
    
    if (kDebugMode) {
      debugPrint('[StaffInboxScreen] Rebuild from cache: raw=${allThreads.length} deduped=${models.length}');
      if (models.isNotEmpty) {
        final first = models.first;
        final last = models.length > 1 ? models.last : null;
        final firstTimeMs = threadTimeMs(dedupedMaps.first);
        final lastTimeMs = dedupedMaps.length > 1 ? threadTimeMs(dedupedMaps.last) : 0;
        debugPrint('[StaffInboxScreen] ✅ SORTED (stable): First=${first.displayName} (timeMs=$firstTimeMs) | Last=${last?.displayName ?? "N/A"} (timeMs=$lastTimeMs)');
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

  DateTime? _parseAnyTs(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    
    if (v is Timestamp) {
      return v.toDate();
    }
    
    try {
      final dyn = v as dynamic;
      final dt = dyn.toDate?.call();
      if (dt is DateTime) return dt;
    } catch (_) {}
    
    if (v is String) {
      final parsed = DateTime.tryParse(v);
      if (parsed != null) return parsed;
    }
    
    if (v is Map) {
      final ms = v['_milliseconds'] ?? v['milliseconds'];
      if (ms is num) {
        return DateTime.fromMillisecondsSinceEpoch(ms.toInt());
      }
      
      final secs = v['_seconds'] ?? v['seconds'] ?? v['sec'];
      if (secs is num) {
        return DateTime.fromMillisecondsSinceEpoch(secs.toInt() * 1000);
      }
    }
    
    if (v is int) {
      if (v > 1000000000000) {
        return DateTime.fromMillisecondsSinceEpoch(v);
      }
      if (v > 1000000000) {
        return DateTime.fromMillisecondsSinceEpoch(v * 1000);
      }
    }
    
    return null;
  }
  
  DateTime? _parseLastMessageAt(dynamic v) {
    final parsed = _parseAnyTs(v);
    if (parsed != null) return parsed;
    
    if (v is Map) {
      if (v['lastMessageAtMs'] is int) {
        return DateTime.fromMillisecondsSinceEpoch(v['lastMessageAtMs'] as int);
      }
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
      final lastMessageAt = _parseAnyTs(thread['lastMessageAt']) ?? _parseAnyTs(thread['updatedAt']);
      if (lastMessageAt != null) return lastMessageAt;
      
      if (thread['lastMessageAtMs'] is int) {
        return DateTime.fromMillisecondsSinceEpoch(thread['lastMessageAtMs'] as int);
      }
      if (thread['lastMessageTimestamp'] is int) {
        final ts = thread['lastMessageTimestamp'] as int;
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
      final isLid = clientJid.endsWith('@lid');
      final isBroadcast = clientJid.endsWith('@broadcast');
      if (hidden) return false;
      if (redirectTo.isNotEmpty) return false;
      if (isLid && canonicalThreadId.isNotEmpty) return false;
      if (isBroadcast) return false;
      return true;
    }).toList();

    final threadsWithTime = <Map<String, dynamic>>[];
    final threadsWithoutTime = <Map<String, dynamic>>[];
    for (final thread in visibleThreads) {
      if (resolveThreadTime(thread) != null) {
        threadsWithTime.add(thread);
      } else {
        threadsWithoutTime.add(thread);
      }
    }
    threadsWithoutTime.sort((a, b) {
      return (b['id'] ?? '').toString().compareTo((a['id'] ?? '').toString());
    });
    final sortedThreads = [...threadsWithTime, ...threadsWithoutTime];

    final dedupedByPhone = <String, Map<String, dynamic>>{};
    for (final thread in sortedThreads) {
      final accountId = _readString(thread['accountId']).trim();
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
      // FIX: Include accountId in dedupe key to prevent merging threads from different accounts
      // Use canonicalThreadId if available, otherwise fallback to threadId or phoneKey/clientJid
      final threadKey = canonicalThreadId.isNotEmpty
          ? canonicalThreadId
          : (threadId.isNotEmpty ? threadId : (phoneKey ?? clientJid));
      // Dedupe key format: accountId::threadKey to ensure threads from different accounts are kept separate
      final key = accountId.isNotEmpty 
          ? '$accountId::$threadKey'
          : threadKey; // Fallback if accountId is missing (shouldn't happen)
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
    final dedupedList = dedupedByPhone.values.toList();
    return dedupedList;
  }

  Future<void> _loadThreads({bool forceRefresh = false}) async {
    if (forceRefresh) {
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] Force refresh: re-subscribing listeners');
      }
      for (final subscription in _threadSubscriptions.values) {
        subscription.cancel();
      }
      _threadSubscriptions.clear();
      _threadsByAccount.clear();
      _activeAccountIds.clear();
      _startThreadListeners();
      await Future.delayed(const Duration(milliseconds: 500));
    }
    _rebuildThreadsFromCache();
  }

  Future<void> _loadAccounts() async {
    setState(() => _isLoadingAccounts = true);
    _errorMessage = null;

    try {
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] Loading accounts via getAccountsStaff...');
      }
      
      // Use staff-safe endpoint (employee-only, no QR codes)
      final response = await _apiService.getAccountsStaff();
      
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] getAccountsStaff response: success=${response['success']}, accountsCount=${(response['accounts'] as List?)?.length ?? 0}');
      }
      
      if (response['success'] == true) {
        final accounts = (response['accounts'] as List<dynamic>? ?? [])
            .cast<Map<String, dynamic>>();

        if (kDebugMode) {
          debugPrint('[StaffInboxScreen] Loaded ${accounts.length} accounts');
          for (final acc in accounts) {
            final phone = acc['phone'] as String?;
            final normalized = _normalizePhoneToDigits(phone);
            final excluded = _shouldExcludeAccount(acc);
            debugPrint('[StaffInboxScreen] Account: id=${acc['id']}, phone=$phone, normalized=$normalized, excluded=$excluded, status=${acc['status']}');
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
        }
      } else {
        final errorMsg = response['message'] as String? ?? 'Failed to load accounts';
        if (kDebugMode) {
          debugPrint('[StaffInboxScreen] getAccountsStaff failed: $errorMsg');
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
        debugPrint('[StaffInboxScreen] Error loading accounts: $e');
        debugPrint('[StaffInboxScreen] Stack trace: $stackTrace');
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
    final allowedAccounts = _accounts.where((account) {
      return !_shouldExcludeAccount(account);
    }).toList();
    final connected = allowedAccounts
        .where((a) => a['status'] == 'connected')
        .map((a) => a['id'] as String?)
        .whereType<String>()
        .toList();
    if (connected.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Niciun cont conectat pentru backfill.')),
      );
      return;
    }
    final accountId = connected.first;
    if (_isBackfilling) return;
    setState(() => _isBackfilling = true);
    try {
      final res = await _apiService.backfillAccount(accountId: accountId);
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] backfill success: $res');
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
        debugPrint('[StaffInboxScreen] backfill error: $e');
        debugPrint('[StaffInboxScreen] backfill stackTrace: $st');
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

  bool _looksLikeProtocolMessage(String displayName) {
    final trimmed = displayName.trim().toUpperCase();
    if (trimmed.isEmpty) return false;
    
    if (trimmed.startsWith('INBOUND-PROBE') || 
        trimmed.startsWith('INBOUND_PROBE') ||
        trimmed.startsWith('OUTBOUND-PROBE') ||
        trimmed.startsWith('OUTBOUND_PROBE') ||
        trimmed.startsWith('PROTOCOL') ||
        trimmed.startsWith('HISTORY-SYNC') ||
        trimmed.startsWith('HISTORY_SYNC')) {
      return true;
    }
    
    if (RegExp(r'^[A-Z0-9_-]{20,}$').hasMatch(trimmed) && 
        (trimmed.contains('_') || trimmed.contains('-'))) {
      return true;
    }
    
    return false;
  }

  Future<bool> _openWhatsAppForCall(String? phoneE164) async {
    if (phoneE164 == null || phoneE164.isEmpty) return false;
    
    var cleaned = phoneE164.trim().replaceAll(RegExp(r'[^\d+]'), '');
    final hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replaceAll('+', '');
    if (cleaned.isEmpty) return false;
    final e164 = hasPlus ? '+$cleaned' : cleaned;

    final native = Uri.parse('whatsapp://send?phone=$e164');
    if (await canLaunchUrl(native)) {
      return launchUrl(native, mode: LaunchMode.externalApplication);
    }

    final waDigits = e164.startsWith('+') ? e164.substring(1) : e164;
    final web = Uri.parse('https://wa.me/$waDigits');
    return launchUrl(web, mode: LaunchMode.externalApplication);
  }

  Future<void> _makePhoneCall(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    
    String cleaned = phone.trim();
    cleaned = cleaned.replaceAll(RegExp(r'[^\d+]'), '');
    final hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replaceAll('+', '');
    if (hasPlus && cleaned.isNotEmpty) {
      cleaned = '+$cleaned';
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
    final backendUrl = Env.whatsappBackendUrl;
    
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () {
            // Use Navigator.pop() to go back to previous screen, not to home
            if (Navigator.canPop(context)) {
              Navigator.pop(context);
            } else {
              context.go('/home');
            }
          },
          tooltip: 'Înapoi',
        ),
        title: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Inbox Angajați'),
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
              await _runBackfill();
              _loadThreads(forceRefresh: true);
            },
            tooltip: 'Sincronizează mesaje',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
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

          // Threads list - all conversations from allowed accounts (excluding 0737571397)
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
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Text('No conversations yet'),
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
                              )
                            : Builder(
                                builder: (context) {
                                  final q = _searchQuery.toLowerCase();
                                  final filtered = q.isEmpty
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

                                  if (filtered.isEmpty) {
                                    return const Center(
                                      child: Text('No conversations match search query'),
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
                                        final ph = t.normalizedPhone ?? t.phone ?? '';
                                        final showPhone = ph.isNotEmpty &&
                                            (t.displayName.isEmpty ||
                                                t.displayName == ph ||
                                                RegExp(r'^\+?[\d\s\-\(\)]+$').hasMatch(t.displayName));
                                        final subtitleParts = <String>[];
                                        if (showPhone) subtitleParts.add(ph);
                                        if (t.lastMessageText.isNotEmpty) {
                                          if (subtitleParts.isNotEmpty) subtitleParts.add('•');
                                          subtitleParts.add(t.lastMessageText);
                                        }
                                        final subtitle = subtitleParts.isEmpty
                                            ? (ph.isNotEmpty ? ph : ' ')
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
                                                    t.initial,
                                                    style: const TextStyle(color: Colors.white),
                                                  ),
                                                ),
                                          title: Row(
                                            children: [
                                              Expanded(
                                                flex: 3,
                                                child: Text(
                                                  () {
                                                    if (t.displayName.isNotEmpty && _looksLikeProtocolMessage(t.displayName)) {
                                                      final ph = t.normalizedPhone ?? t.phone ?? '';
                                                      if (ph.isNotEmpty) return ph;
                                                      final jid = t.clientJid ?? '';
                                                      if (jid.isNotEmpty) {
                                                        final phoneFromJid = _extractPhoneFromJid(jid);
                                                        return phoneFromJid ?? jid.split('@')[0] ?? '';
                                                      }
                                                      return '';
                                                    }
                                                    return t.displayName.isNotEmpty
                                                        ? t.displayName
                                                        : (t.normalizedPhone ?? t.phone ?? '');
                                                  }(),
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
                                                      t.accountName!,
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
                                            subtitle,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontSize: 13),
                                          ),
                                          trailing: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              if (timeText.isNotEmpty)
                                                Text(
                                                  timeText,
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    color: Colors.grey[600],
                                                  ),
                                                ),
                                              if (ph.isNotEmpty) ...[
                                                if (timeText.isNotEmpty) const SizedBox(width: 8),
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
