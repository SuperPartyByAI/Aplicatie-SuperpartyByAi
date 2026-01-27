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

import '../../core/errors/app_exception.dart';
import '../../core/config/env.dart';
import '../../models/thread_model.dart';
import '../../services/whatsapp_api_service.dart';
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
  
  // Firestore thread streams (per account)
  final Map<String, StreamSubscription<QuerySnapshot>> _threadSubscriptions = {};
  final Map<String, List<Map<String, dynamic>>> _threadsByAccount = {};
  /// Account IDs we last started listeners for. Skip re-subscribe when unchanged.
  Set<String> _activeAccountIds = {};

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
    _loadAccounts();
  }

  @override
  void dispose() {
    for (final subscription in _threadSubscriptions.values) {
      subscription.cancel();
    }
    _threadSubscriptions.clear();
    _activeAccountIds = {};
    super.dispose();
  }

  void _startThreadListeners() {
    final accountIds = _accounts
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

      // CRITICAL FIX: Add orderBy to get threads sorted by lastMessageAt from Firestore
      // This ensures correct chronological order even before client-side sorting
      final subscription = FirebaseFirestore.instance
          .collection('threads')
          .where('accountId', isEqualTo: accountId)
          .orderBy('lastMessageAt', descending: true)
          .snapshots()
          .listen(
        (snapshot) {
          final accountName = _accounts
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
                '[WhatsAppInboxScreen] Thread stream update: accountId=$accountId threads=${threads.length}');
            // Log first thread's lastMessageAt and lastMessageText to debug sync
            if (threads.isNotEmpty) {
              final firstThread = threads[0];
              final lastMessageAt = firstThread['lastMessageAt'];
              final lastMessageText = firstThread['lastMessageText'] ?? firstThread['lastMessagePreview'];
              debugPrint(
                  '[WhatsAppInboxScreen] First thread: id=${firstThread['id']?.toString().substring(0, 20)} lastMessageAt=$lastMessageAt lastMessageText=${lastMessageText?.toString().substring(0, 30)}');
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
        },
        cancelOnError: false, // Keep listening even on errors
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

  void _rebuildThreadsFromCache() {
    final allThreads = _threadsByAccount.values.expand((list) => list).toList();
    final dedupedMaps = _filterAndDedupeThreads(allThreads);
    final models = dedupedMaps
        .map((m) => ThreadModel.fromJson(Map<String, dynamic>.from(m)))
        .toList();
    if (kDebugMode) {
      debugPrint('[WhatsAppInboxScreen] Rebuild from cache: raw=${allThreads.length} deduped=${models.length}');
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
  DateTime? _parseAnyTs(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    // CRITICAL FIX: Handle Firestore Timestamp objects from cloud_firestore package
    if (v is Timestamp) {
      return v.toDate();
    }
    if (v is String) {
      final parsed = DateTime.tryParse(v);
      if (parsed != null) return parsed;
    }
    if (v is Map) {
      final secs = v['_seconds'] ?? v['seconds'];
      if (secs is num) {
        return DateTime.fromMillisecondsSinceEpoch(secs.toInt() * 1000);
      }
      final ms = v['_milliseconds'] ?? v['milliseconds'];
      if (ms is num) {
        return DateTime.fromMillisecondsSinceEpoch(ms.toInt());
      }
    }
    if (v is int) {
      // Assume milliseconds if > 1e12, otherwise seconds
      if (v > 1e12) {
        return DateTime.fromMillisecondsSinceEpoch(v);
      } else {
        return DateTime.fromMillisecondsSinceEpoch(v * 1000);
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
      final isLid = clientJid.endsWith('@lid');
      final isBroadcast = clientJid.endsWith('@broadcast');
      if (hidden) return false;
      if (redirectTo.isNotEmpty) return false;
      if (isLid && canonicalThreadId.isNotEmpty) return false;
      if (isBroadcast) return false;
      return true;
    }).toList();

    visibleThreads.sort((a, b) {
      final timeA = resolveThreadTime(a);
      final timeB = resolveThreadTime(b);
      
      // CRITICAL FIX: Threads without timestamp should be sorted LAST (use very old date)
      // This ensures threads with real timestamps appear first in correct chronological order
      final epochStart = DateTime.fromMillisecondsSinceEpoch(0);
      final aa = timeA ?? epochStart;
      final bb = timeB ?? epochStart;
      
      // Sort descending (newest first)
      final c = bb.compareTo(aa);
      if (c != 0) return c;
      
      // Tie-break: use thread ID for stable sort
      return (b['id'] ?? '').toString().compareTo((a['id'] ?? '').toString());
    });

    final dedupedByPhone = <String, Map<String, dynamic>>{};
    for (final thread in visibleThreads) {
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
    final dedupedList = dedupedByPhone.values.toList();
    // CRITICAL FIX: Sortăm din nou după deduplicare pentru a păstra ordinea corectă
    dedupedList.sort((a, b) {
      final timeA = resolveThreadTime(a);
      final timeB = resolveThreadTime(b);
      // CRITICAL FIX: Threads without timestamp should be sorted LAST
      final epochStart = DateTime.fromMillisecondsSinceEpoch(0);
      final aa = timeA ?? epochStart;
      final bb = timeB ?? epochStart;
      final c = bb.compareTo(aa);
      if (c != 0) return c;
      return (b['id'] ?? '').toString().compareTo((a['id'] ?? '').toString());
    });
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

    try {
      final response = await _apiService.getAccounts();
      if (response['success'] == true) {
        final accounts = (response['accounts'] as List<dynamic>? ?? [])
            .cast<Map<String, dynamic>>();

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
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoadingAccounts = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading accounts: $e')),
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
    final connected = _accounts
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

  @override
  Widget build(BuildContext context) {
    // Debug: Show backend URL in debug mode
    final backendUrl = Env.whatsappBackendUrl;
    
    return Scaffold(
      appBar: AppBar(
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
                                        final ph = t.phone ?? '';
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
                                                    // Filter out protocol messages - use fallback if displayName looks like protocol message
                                                    if (t.displayName.isNotEmpty && _looksLikeProtocolMessage(t.displayName)) {
                                                      // Use phone number as fallback if available
                                                      final ph = t.phone ?? '';
                                                      if (ph.isNotEmpty) return ph;
                                                      // Otherwise use clientJid or empty
                                                      final jid = t.clientJid ?? '';
                                                      if (jid.isNotEmpty) {
                                                        final phoneFromJid = _extractPhoneFromJid(jid);
                                                        return phoneFromJid ?? jid.split('@')[0] ?? '';
                                                      }
                                                      return '';
                                                    }
                                                    return t.displayName.isNotEmpty
                                                        ? t.displayName
                                                        : (t.phone ?? '');
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
                                          trailing: timeText.isEmpty
                                              ? null
                                              : Text(
                                                  timeText,
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    color: Colors.grey[600],
                                                  ),
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
