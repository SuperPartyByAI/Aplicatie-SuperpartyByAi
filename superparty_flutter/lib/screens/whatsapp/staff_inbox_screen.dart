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
import '../../config/admin_phone.dart';
import '../../models/thread_model.dart';
import '../../services/whatsapp_api_service.dart';
import '../../utils/staff_inbox_empty_state.dart';
import '../../utils/threads_query.dart';
import '../../utils/inbox_schema_guard.dart';
import '../debug/whatsapp_diagnostics_screen.dart';
import 'package:cached_network_image/cached_network_image.dart';

/// Staff Inbox Screen - Identical to WhatsAppInboxScreen but excludes account with phone 0737571397
/// Shows conversations from all connected accounts EXCEPT the excluded phone number
class StaffInboxScreen extends StatefulWidget {
  const StaffInboxScreen({super.key});

  @override
  State<StaffInboxScreen> createState() => _StaffInboxScreenState();
}

class _StaffInboxScreenState extends State<StaffInboxScreen>
    with WidgetsBindingObserver {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;

  List<Map<String, dynamic>> _accounts = [];
  bool _isBackfilling = false;
  bool _isLoadingAccounts = true;
  bool _isLoadingThreads = false;
  String _searchQuery = '';
  List<ThreadModel> _threads = [];
  String? _errorMessage;
  /// Set on Firestore stream error: 'failed-precondition' | 'permission-denied'
  String? _firestoreErrorCode;

  // Firestore thread streams (per account)
  final Map<String, StreamSubscription<QuerySnapshot>> _threadSubscriptions = {};
  final Map<String, List<Map<String, dynamic>>> _threadsByAccount = {};
  Set<String> _activeAccountIds = {};
  
  // Auto-refresh timer: refresh threads every 10 seconds to catch new messages
  Timer? _autoRefreshTimer;

  /// Auto-backfill once per session so istoricul de pe telefon apare automat.
  bool _hasRunAutoBackfill = false;

  /// Exclude admin phone (0737571397) from staff inbox. Uses config/admin_phone.
  bool _shouldExcludeAccount(Map<String, dynamic> account) {
    final phone = account['phone'] as String? ?? account['phoneNumber'] as String?;
    return isAdminPhone(phone);
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

  /// One-time [AUTH] debug log on open (grep: [AUTH])
  Future<void> _logAuthDiagnostics() async {
    if (!kDebugMode) return;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      debugPrint('[AUTH] uid=null email=null (not signed in)');
      return;
    }
    try {
      final token = await user.getIdTokenResult(true);
      final claims = token.claims ?? {};
      final claimsKeys = claims.keys.where(
        (k) => !['iat', 'exp', 'aud', 'iss', 'sub', 'auth_time', 'user_id', 'firebase'].contains(k),
      ).toList();
      final adminClaimPresent = claims['admin'] == true;

      bool staffProfileExists = false;
      String? staffProfileRole;
      try {
        final snap = await FirebaseFirestore.instance
            .collection('staffProfiles')
            .doc(user.uid)
            .get();
        staffProfileExists = snap.exists;
        if (snap.exists && snap.data() != null) {
          staffProfileRole = snap.data()!['role'] as String?;
        }
      } catch (_) {}

      debugPrint(
        '[AUTH] uid=${user.uid} email=${user.email ?? "null"} '
        'claimsKeys=$claimsKeys adminClaimPresent=$adminClaimPresent '
        'staffProfileExists=$staffProfileExists staffProfileRole=$staffProfileRole',
      );
    } catch (e) {
      debugPrint('[AUTH] uid=${user.uid} email=${user.email ?? "null"} error=$e');
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Defer auth diagnostics to avoid Firestore/token work during initial load
    Future.delayed(const Duration(milliseconds: 1500), _logAuthDiagnostics);
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
    WidgetsBinding.instance.removeObserver(this);
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = null;
    for (final subscription in _threadSubscriptions.values) {
      subscription.cancel();
    }
    _threadSubscriptions.clear();
    _activeAccountIds = {};
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state != AppLifecycleState.resumed) return;
    if (!mounted) return;
    // Sync visual when app returns to foreground (e.g. from phone background)
    if (kDebugMode) {
      debugPrint('[StaffInboxScreen] App resumed: refreshing accounts and threads');
    }
    _onAppResumed();
  }

  Future<void> _onAppResumed() async {
    await _loadAccounts();
    if (!mounted) return;
    await _loadThreads(forceRefresh: true);
  }

  Future<void> _startThreadListeners() async {
    // Filter accounts: only connected accounts, excluding the one with phone 0737571397
    final connectedAccounts = _accounts
        .where((account) => account['status'] == 'connected')
        .toList();
    
    final allowedAccounts = connectedAccounts.where((account) {
      return !_shouldExcludeAccount(account);
    }).toList();
    
    final accountIds = allowedAccounts
        .map((account) => account['id'])
        .whereType<String>()
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet();

    if (kDebugMode) {
      final statusByAccount = {
        for (final a in allowedAccounts) (a['id'] as String? ?? ''): (a['status'] as String? ?? '?')
      };
      debugPrint('[StaffInboxScreen] DEBUG accountsCount=${allowedAccounts.length} accountIds=${accountIds.toList()} statusByAccount=$statusByAccount');
      debugPrint('[StaffInboxScreen] Total accounts: ${_accounts.length}; connected: ${connectedAccounts.length}; allowed: ${allowedAccounts.length}');
      for (final acc in connectedAccounts) {
        final phone = acc['phone'] as String? ?? acc['phoneNumber'] as String?;
        final excluded = _shouldExcludeAccount(acc);
        debugPrint('[StaffInboxScreen] Account: id=${acc['id']}, phone=$phone, excluded=$excluded, status=${acc['status']}');
      }
    }

    if (accountIds.isEmpty) {
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] 0 allowed account IDs (no thread listeners started). Connected=${connectedAccounts.length}, excluded=admin phone.');
      }
      for (final sub in _threadSubscriptions.values) {
        sub.cancel();
      }
      _threadSubscriptions.clear();
      _threadsByAccount.clear();
      _activeAccountIds = {};
      if (mounted) {
        setState(() {
          _threads = [];
          _isLoadingThreads = false;
          _errorMessage = _accounts.isEmpty
              ? null
              : 'Toate conturile sunt deconectate sau excluse (admin). Conectează conturi în Manage Accounts.';
        });
      }
      return;
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

    final toAdd = accountIds.where((id) => !_threadSubscriptions.containsKey(id)).toList();
    if (toAdd.isNotEmpty) {
      try {
        final futures = toAdd.map((accountId) async {
          try {
            final snap = await buildThreadsQuery(accountId)
                .get(const GetOptions(source: Source.cache));
            if (!mounted) return;
            final accountName = allowedAccounts
                    .firstWhere(
                      (a) => a['id'] == accountId,
                      orElse: () => <String, dynamic>{},
                    )['name'] as String? ??
                accountId;
            final threads = snap.docs.map((doc) {
              logThreadSchemaAnomalies(doc);
              return {
                'id': doc.id,
                ...doc.data(),
                'accountId': accountId,
                'accountName': accountName,
              };
            }).toList();
            if (threads.isNotEmpty && mounted) {
              _threadsByAccount[accountId] = threads;
              _rebuildThreadsFromCache();
            }
          } catch (_) { /* no cache */ }
        });
        await Future.wait(futures);
      } catch (_) { /* ignore */ }
    }

    int added = 0;
    for (final accountId in accountIds) {
      if (_threadSubscriptions.containsKey(accountId)) continue;

      final subscription = buildThreadsQuery(accountId).snapshots().listen(
        (snapshot) {
          final accountName = allowedAccounts
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
                '[StaffInboxScreen] Thread stream snapshot accountId=$accountId docs=${threads.length}');
            if (threads.isEmpty) {
              debugPrint('[StaffInboxScreen] 0 docs for accountId=$accountId');
            }
            debugPrint(
                '[Firebase-inbox-audit] StaffInbox threads result: accountId=$accountId '
                'count=${threads.length}');
          }
          _rebuildThreadsFromCache();
        },
        onError: (error) {
          debugPrint(
              '[StaffInboxScreen] Thread stream error ($accountId): $error');
          if (error is FirebaseException) {
            debugPrint(
                '[StaffInboxScreen] FirebaseException code=${error.code} message=${error.message}');
            debugPrint(
                '[Firebase-inbox-audit] Firestore threads error: accountId=$accountId '
                'code=${error.code} message=${error.message}');
            if (mounted) {
              setState(() {
                _firestoreErrorCode = error.code;
                if (error.code == 'failed-precondition') {
                  _errorMessage = 'Index mismatch. Verifică indexurile Firestore pentru threads.';
                } else if (error.code == 'permission-denied') {
                  _errorMessage = 'Rules/RBAC blocked. Nu ai permisiune de citire pe threads.';
                } else {
                  _errorMessage = 'Eroare Firestore: ${error.code} – ${error.message}';
                }
              });
            }
          } else if (mounted) {
            setState(() {
              _firestoreErrorCode = null;
              _errorMessage = 'Eroare la încărcarea conversațiilor: $error';
            });
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
          '[StaffInboxScreen] Thread listeners updated: active=$accountIds '
          'cancelled=$staleIds added=$added');
    }
    if (kDebugMode && added > 0) {
      debugPrint(
          '[Firebase-inbox-audit] StaffInbox threads query: accountIds=$accountIds, '
          'collection=threads, where=accountId==<id>, orderBy=lastMessageAt desc, limit=200');
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
      debugPrint('[StaffInboxScreen] Rebuild from cache: raw=${allThreads.length} deduped=${models.length} threadsCount=${models.length}');
      if (models.isNotEmpty) {
        final first = models.first;
        final last = models.length > 1 ? models.last : null;
        final firstTimeMs = threadTimeMs(dedupedMaps.first);
        final lastTimeMs = dedupedMaps.length > 1 ? threadTimeMs(dedupedMaps.last) : 0;
        debugPrint('[StaffInboxScreen] ✅ SORTED (stable): First=${first.displayName} (timeMs=$firstTimeMs) | Last=${last?.displayName ?? "N/A"} (timeMs=$lastTimeMs)');
      } else if (_activeAccountIds.isNotEmpty) {
        debugPrint('[StaffInboxScreen] 0 threads for accountIds=${_activeAccountIds.toList()}. Possible: no threads in Firestore for these accounts, or permission-denied (check FirebaseException).');
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
      if (!mounted) return;
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] Force refresh: re-subscribing listeners');
      }
      setState(() {
        _errorMessage = null;
        _firestoreErrorCode = null;
      });
      for (final subscription in _threadSubscriptions.values) {
        subscription.cancel();
      }
      _threadSubscriptions.clear();
      _threadsByAccount.clear();
      _activeAccountIds.clear();
      await _startThreadListeners();
      if (!mounted) return;
      await Future.delayed(const Duration(milliseconds: 300));
      if (!mounted) return;
    }
    if (!mounted) return;
    _rebuildThreadsFromCache();
  }

  Future<void> _loadAccounts() async {
    setState(() {
      _isLoadingAccounts = true;
      _errorMessage = null;
      _firestoreErrorCode = null;
    });

    try {
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] Loading accounts via getAccountsStaff...');
      }
      
      // Use staff-safe endpoint (employee-only, no QR codes)
      // AuthWrapper handles authentication - if user is not authenticated, they'll be redirected to login
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
            final phone = acc['phone'] as String? ?? acc['phoneNumber'] as String?;
            final excluded = _shouldExcludeAccount(acc);
            debugPrint('[StaffInboxScreen] Account: id=${acc['id']}, phone=$phone, excluded=$excluded, status=${acc['status']}');
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
          } else {
            // Auto-backfill la primul load: istoricul de pe telefon apare automat, fără buton
            final allowed = accounts
                .where((a) => !_shouldExcludeAccount(a) && a['status'] == 'connected')
                .toList();
            if (!_hasRunAutoBackfill && allowed.isNotEmpty) {
              _hasRunAutoBackfill = true;
              _runBackfill(silent: true).catchError((e) {
                if (kDebugMode) {
                  debugPrint('[StaffInboxScreen] Auto-backfill failed: $e');
                }
              });
            }
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
        if (e.toString().toLowerCase().contains('timeout')) {
          debugPrint('[StaffInboxScreen] timeout');
        }
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

  /// Run backfill for **all** connected staff accounts (same as admin – istoric complet).
  /// When [silent] is true (auto-backfill), no SnackBars are shown.
  Future<void> _runBackfill({bool silent = false}) async {
    if (FirebaseAuth.instance.currentUser == null) {
      if (!mounted) return;
      if (!silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trebuie să fii autentificat.')),
        );
      }
      return;
    }
    final allowedAccounts = _accounts
        .where((a) => !_shouldExcludeAccount(a) && a['status'] == 'connected')
        .toList();
    final connected = allowedAccounts
        .map((a) => a['id'] as String?)
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toList();
    if (connected.isEmpty) {
      if (!mounted) return;
      if (!silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Niciun cont conectat pentru backfill.')),
        );
      }
      return;
    }
    if (_isBackfilling) return;
    setState(() => _isBackfilling = true);
    int done = 0;
    int failed = 0;
    try {
      for (int i = 0; i < connected.length; i++) {
        final accountId = connected[i];
        if (!mounted) break;
        if (!silent) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Backfill ${i + 1}/${connected.length}…'),
              duration: const Duration(seconds: 2),
            ),
          );
        }
        try {
          await _apiService.backfillAccount(accountId: accountId);
          done++;
          if (kDebugMode) {
            debugPrint('[StaffInboxScreen] backfill success for $accountId');
          }
        } catch (e, st) {
          failed++;
          if (kDebugMode) {
            debugPrint('[StaffInboxScreen] backfill error for $accountId: $e');
            debugPrint('[StaffInboxScreen] stackTrace: $st');
          }
        }
        if (i < connected.length - 1) {
          await Future.delayed(const Duration(milliseconds: 800));
        }
      }
      _startThreadListeners();
      _rebuildThreadsFromCache();
      if (!mounted) return;
      if (!silent) {
        final msg = failed == 0
            ? 'Backfill gata pentru $done conturi. Reîmprospătare…'
            : 'Backfill: $done ok, $failed eșecuri. Reîmprospătare…';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: failed == 0 ? Colors.green[700] : Colors.orange[800],
          ),
        );
      } else if (kDebugMode && (done > 0 || failed > 0)) {
        debugPrint('[StaffInboxScreen] Auto-backfill done: $done ok, $failed failed');
      }
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('[StaffInboxScreen] backfill error: $e');
        debugPrint('[StaffInboxScreen] backfill stackTrace: $st');
      }
      if (!mounted) return;
      if (!silent) {
        String msg;
        if (e is UnauthorizedException || e is ForbiddenException) {
          msg = 'Acces refuzat. Trebuie să fii angajat sau admin.';
        } else {
          msg = e.toString();
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.red[700]),
        );
      }
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

  /// True when thread has no real name/phone (we'd show "Contact"/"Grup"/"Conversație").
  /// Used to hide placeholder-only threads and show only real contacts.
  bool _isPlaceholderOnly(ThreadModel t) {
    final name = t.displayName.trim();
    final ph = (t.normalizedPhone ?? t.phone ?? '').trim();
    return name.isEmpty && ph.isEmpty;
  }

  /// Fallback only when both displayName and phone are empty (removes blank "Last" etc.).
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
            child: _isLoadingAccounts
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            CircularProgressIndicator(),
                            SizedBox(height: 16),
                            Text('Se încarcă conturile...', style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      )
                    : (_isLoadingThreads && _threads.isEmpty)
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            CircularProgressIndicator(),
                            SizedBox(height: 16),
                            Text('Se încarcă conversațiile...', style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      )
                    : _errorMessage != null
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.error_outline, size: 64, color: Colors.red[300]),
                                  const SizedBox(height: 16),
                                  Text(
                                    _errorMessage!,
                                    style: TextStyle(color: Colors.red[700]),
                                    textAlign: TextAlign.center,
                                  ),
                                  if (_firestoreErrorCode != null) ...[
                                    const SizedBox(height: 8),
                                    Text(
                                      'Cod: $_firestoreErrorCode',
                                      style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                                    ),
                                  ],
                                  const SizedBox(height: 16),
                                  ElevatedButton(
                                    onPressed: () => _loadThreads(forceRefresh: true),
                                    child: const Text('Retry'),
                                  ),
                                ],
                              ),
                            ),
                          )
                            : _threads.isEmpty
                            ? Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.inbox_outlined, size: 64, color: Colors.grey[400]),
                                      const SizedBox(height: 16),
                                      Text(
                                        _activeAccountIds.isEmpty
                                            ? 'Nu există conturi conectate pentru Inbox Angajați.'
                                            : 'Nu apar conversații / mesaje din istoric pentru conturile conectate.',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(color: Colors.grey[700], fontSize: 14),
                                      ),
                                      if (showRepairCallout(_activeAccountIds.length, _threads.length)) ...[
                                        const SizedBox(height: 16),
                                        Container(
                                          padding: const EdgeInsets.all(14),
                                          decoration: BoxDecoration(
                                            color: Colors.blue.shade50,
                                            borderRadius: BorderRadius.circular(10),
                                            border: Border.all(color: Colors.blue.shade200),
                                          ),
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                'Pentru a importa conversațiile și istoricul:',
                                                style: TextStyle(
                                                  color: Colors.blue.shade900,
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 13,
                                                ),
                                              ),
                                              const SizedBox(height: 8),
                                              Text(
                                                '1. Manage Accounts → Disconnect la fiecare cont\n'
                                                '2. Connect → scanează QR din nou (WhatsApp → Linked devices → Link a device)\n'
                                                '3. La reconectare se importă lista de chat-uri și mesajele.',
                                                style: TextStyle(color: Colors.blue.shade800, fontSize: 12, height: 1.4),
                                              ),
                                              const SizedBox(height: 6),
                                              Text(
                                                'Sync/Backfill completează doar conversațiile deja existente; nu creează altele noi.',
                                                style: TextStyle(color: Colors.blue.shade700, fontSize: 11, fontStyle: FontStyle.italic),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                      const SizedBox(height: 16),
                                      ElevatedButton.icon(
                                        onPressed: () async {
                                          await _loadAccounts();
                                          await _loadThreads(forceRefresh: true);
                                        },
                                        icon: const Icon(Icons.refresh),
                                        label: const Text('Reîmprospătare'),
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
                                  // Show only real contacts (hide "Contact"/"Grup"/"Conversație" placeholders)
                                  final filtered = base.where((t) => !_isPlaceholderOnly(t)).toList();

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
                                              '&displayName=${Uri.encodeComponent(t.displayName)}'
                                              '&returnRoute=${Uri.encodeComponent('/whatsapp/inbox-staff')}',
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
