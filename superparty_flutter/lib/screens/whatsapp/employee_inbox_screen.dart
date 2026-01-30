import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/thread_model.dart';
import '../../services/whatsapp_api_service.dart';
import '../../services/whatsapp_account_service.dart';
import '../../utils/threads_query.dart';
import '../../utils/thread_sort_utils.dart';
import '../../utils/inbox_schema_guard.dart';
import 'package:cached_network_image/cached_network_image.dart';

/// Employee Inbox Screen - Shows threads from employee's assigned WhatsApp accounts
/// Includes dropdown to select which account to view
class EmployeeInboxScreen extends StatefulWidget {
  const EmployeeInboxScreen({super.key});

  @override
  State<EmployeeInboxScreen> createState() => _EmployeeInboxScreenState();
}

class _EmployeeInboxScreenState extends State<EmployeeInboxScreen>
    with WidgetsBindingObserver {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  final WhatsAppAccountService _accountService =
      WhatsAppAccountService.instance;

  List<String> _employeeAccountIds = [];
  String? _selectedAccountId;
  bool _isLoading = true;
  String? _errorMessage;

  /// Set on Firestore stream error: 'failed-precondition' | 'permission-denied'
  String? _firestoreErrorCode;
  String _searchQuery = '';
  List<ThreadModel> _threads = [];
  bool _isBackfilling = false;
  bool _hasRunAutoBackfill = false; // Track if auto-backfill has run

  // Auto-refresh timer: refresh threads every 10 seconds
  Timer? _autoRefreshTimer;

  // Firestore thread streams (per account)
  final Map<String, StreamSubscription<QuerySnapshot>> _threadSubscriptions =
      {};
  final Map<String, List<Map<String, dynamic>>> _threadsByAccount = {};

  // Debounce for UI rebuilds to prevent excessive processing when multiple streams update
  Timer? _rebuildDebounceTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadEmployeeAccounts();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = null;
    _rebuildDebounceTimer?.cancel();
    _rebuildDebounceTimer = null;
    for (final subscription in _threadSubscriptions.values) {
      subscription.cancel();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state != AppLifecycleState.resumed) return;
    if (!mounted) return;
    if (kDebugMode) {
      debugPrint(
          '[EmployeeInboxScreen] App resumed: refreshing accounts and threads');
    }
    _loadEmployeeAccounts();
  }

  Future<void> _loadEmployeeAccounts() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _firestoreErrorCode = null;
    });

    try {
      final accountIds = await _accountService.getEmployeeWhatsAppAccountIds();

      if (accountIds.isEmpty) {
        debugPrint(
            '[EmployeeInboxScreen] getEmployeeWhatsAppAccountIds returned 0 (not employee or no accounts assigned)');
        setState(() {
          _isLoading = false;
          _errorMessage =
              'Nu ai conturi WhatsApp de angajat configurate. Contactează administratorul.';
          _employeeAccountIds = [];
        });
        return;
      }
      debugPrint(
          '[EmployeeInboxScreen] Option A (accountId + orderBy lastMessageAt). accountIds count=${accountIds.length}');
      debugPrint('[EmployeeInboxScreen] Employee account IDs: $accountIds');

      setState(() {
        _employeeAccountIds = accountIds;
        _selectedAccountId = accountIds.first;
      });

      await _loadAccountDetails();
      _startThreadListeners();
      _startAutoRefreshTimer();

      // Auto-backfill: sync old messages on first load (only once per session)
      if (!_hasRunAutoBackfill && _employeeAccountIds.isNotEmpty) {
        _hasRunAutoBackfill = true;
        // Run backfill in background (don't block UI) for all connected accounts
        _runAutoBackfillForAccounts().catchError((e) {
          if (kDebugMode) {
            debugPrint('[EmployeeInboxScreen] Auto-backfill failed: $e');
          }
          // Silently fail - user can manually trigger backfill if needed
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Eroare la încărcarea conturilor: $e';
      });
    }
  }

  void _startAutoRefreshTimer() {
    if (_autoRefreshTimer != null) return;
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (!mounted) return;
      if (_employeeAccountIds.isEmpty) return;
      // Force refresh from server so inbox updates without manual pull-to-refresh.
      _refreshThreadsOnce().catchError((e) {
        if (kDebugMode) {
          debugPrint('[EmployeeInboxScreen] Auto-refresh failed: $e');
        }
      });
    });
  }

  Future<void> _refreshThreadsOnce() async {
    if (_employeeAccountIds.isEmpty) return;
    final accountIds = List<String>.from(_employeeAccountIds);
    for (final accountId in accountIds) {
      try {
        final snap = await buildThreadsQuery(accountId)
            .get(const GetOptions(source: Source.server));
        _threadsByAccount[accountId] = snap.docs.map((doc) {
          logThreadSchemaAnomalies(doc);
          return {
            'id': doc.id,
            ...doc.data(),
            'accountId': accountId,
          };
        }).toList();
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[EmployeeInboxScreen] refreshThreadsOnce error: $e');
        }
      }
    }
    _rebuildThreads();
  }

  Future<void> _loadAccountDetails() async {
    try {
      final response = await _apiService.getAccounts();
      if (response['success'] == true) {
        final accounts = (response['accounts'] as List<dynamic>? ?? [])
            .cast<Map<String, dynamic>>();

        // Filter to only show employee's allowed accounts
        final allowedAccounts = accounts.where((acc) {
          final id = acc['id'] as String?;
          return id != null && _employeeAccountIds.contains(id);
        }).toList();

        // Update account names in state if needed
        // (For now, we just use IDs, but could store account names here)
      }
    } catch (e) {
      debugPrint('[EmployeeInboxScreen] Error loading account details: $e');
    }
  }

  /// One stream per accountId via buildThreadsQuery; merge + sort in memory. Filters (hidden/archived/…) in memory only.
  void _startThreadListeners() {
    final accountIds = List<String>.from(_employeeAccountIds);
    if (accountIds.isEmpty) {
      setState(() => _isLoading = false);
      return;
    }
    if (kDebugMode) {
      debugPrint('[EmployeeInboxScreen] accountIds queried: $accountIds');
    }

    for (final id in _threadSubscriptions.keys.toList()) {
      if (!accountIds.contains(id)) {
        _threadSubscriptions[id]?.cancel();
        _threadSubscriptions.remove(id);
        _threadsByAccount.remove(id);
      }
    }

    for (final accountId in accountIds) {
      if (_threadSubscriptions.containsKey(accountId)) continue;

      final sub = buildThreadsQuery(accountId).snapshots().listen(
        (snapshot) {
          if (kDebugMode) {
            final n = snapshot.docs.length;
            debugPrint(
                '[EmployeeInboxScreen] Thread stream snapshot accountId=$accountId docs=$n');
            if (n == 0)
              debugPrint(
                  '[EmployeeInboxScreen] 0 docs for accountId=$accountId');
          }
          _threadsByAccount[accountId] = snapshot.docs.map((doc) {
            logThreadSchemaAnomalies(doc);
            return {
              'id': doc.id,
              ...doc.data(),
              'accountId': accountId,
            };
          }).toList();
          _throttledRebuild();
        },
        onError: (error) {
          debugPrint(
              '[EmployeeInboxScreen] Thread stream error ($accountId): $error');
          if (error is FirebaseException) {
            debugPrint(
                '[EmployeeInboxScreen] FirebaseException code=${error.code} message=${error.message}');
            if (mounted) {
              setState(() {
                _firestoreErrorCode = error.code;
                if (error.code == 'failed-precondition') {
                  _errorMessage =
                      'Index mismatch. Verifică indexurile Firestore pentru threads.';
                } else if (error.code == 'permission-denied') {
                  _errorMessage =
                      'Rules/RBAC blocked. Nu ai permisiune de citire pe threads.';
                } else {
                  _errorMessage =
                      'Eroare Firestore: ${error.code} – ${error.message}';
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
      _threadSubscriptions[accountId] = sub;
    }

    setState(() => _isLoading = false);
  }

  /// Parse timestamp from thread data (handles multiple formats)
  int _threadTimeMs(Map<String, dynamic> thread) {
    // Try lastMessageAtMs first (milliseconds)
    final ms = thread['lastMessageAtMs'];
    if (ms is int && ms > 0) return ms;
    
    // Try lastMessageAt (Firestore Timestamp or DateTime)
    final ts = thread['lastMessageAt'];
    if (ts == null) return 0;
    
    if (ts is Timestamp) {
      return ts.millisecondsSinceEpoch;
    }
    
    // Try toDate() method if available
    try {
      final dyn = ts as dynamic;
      final dt = dyn.toDate?.call();
      if (dt is DateTime) return dt.millisecondsSinceEpoch;
    } catch (_) {}
    
    // Try DateTime directly
    if (ts is DateTime) {
      return ts.millisecondsSinceEpoch;
    }
    
    // Try ISO string
    if (ts is String) {
      final parsed = DateTime.tryParse(ts);
      if (parsed != null) return parsed.millisecondsSinceEpoch;
    }
    
    // Try Firestore timestamp map format
    if (ts is Map) {
      final seconds = ts['_seconds'] ?? ts['seconds'];
      if (seconds is int) {
        return seconds * 1000;
      }
      final ms = ts['_milliseconds'] ?? ts['milliseconds'];
      if (ms is int) return ms;
    }
    
    // Try lastMessageTimestamp (seconds)
    final timestamp = thread['lastMessageTimestamp'];
    if (timestamp is int) {
      // Assume milliseconds if > 1e12, otherwise seconds
      if (timestamp > 1000000000000) {
        return timestamp;
      } else if (timestamp > 1000000000) {
        return timestamp * 1000;
      }
    }
    
    return 0;
  }

  void _throttledRebuild() {
    _rebuildDebounceTimer?.cancel();
    _rebuildDebounceTimer = Timer(const Duration(milliseconds: 100), () {
      if (mounted) {
        _rebuildThreads();
      }
    });
  }
  void _rebuildThreads() {
    // Merge from all accounts (N queries), then filter in memory
    final allThreads = _threadsByAccount.values.expand((list) => list).toList();

    final visibleThreads = allThreads.where((thread) {
      final hidden = thread['hidden'] == true || thread['archived'] == true;
      final redirectTo = (thread['redirectTo'] as String? ?? '').trim();
      final clientJid = (thread['clientJid'] as String? ?? '').trim();
      final tid = (thread['id'] as String? ?? '').trim();
      final isBroadcast = clientJid.endsWith('@broadcast');
      if (hidden) return false;
      if (redirectTo.isNotEmpty) return false;
      if (isBroadcast) return false;
      if (tid.contains('[object Object]') || tid.contains('[obiect Obiect]'))
        return false;
      return true;
    }).toList();

    // Filter by selected account when dropdown is used (in-memory)
    final toShow = _employeeAccountIds.length > 1 && _selectedAccountId != null
        ? visibleThreads
            .where((t) => (t['accountId'] as String?) == _selectedAccountId)
            .toList()
        : visibleThreads;

    // Sort desc by threadTimeMs (lastMessageAtMs → lastMessageAt → updatedAt → lastMessageTimestamp).
    // Stable tie-break by thread id so threads with same "Xh ago" don't appear mixed.
    toShow.sort((a, b) {
      final aMs = threadTimeMs(a);
      final bMs = threadTimeMs(b);
      final timeCmp = bMs.compareTo(aMs);
      if (timeCmp != 0) return timeCmp;
      final aId = (a['id'] ?? a['threadId'] ?? a['clientJid'] ?? '').toString();
      final bId = (b['id'] ?? b['threadId'] ?? b['clientJid'] ?? '').toString();
      return aId.compareTo(bId);
    });

    final models = toShow
        .map((m) => ThreadModel.fromJson(Map<String, dynamic>.from(m)))
        .toList();

    if (mounted) {
      setState(() {
        _threads = models;
      });
    }
  }

  String? _extractPhoneFromJid(String? jid) {
    if (jid == null || jid.isEmpty) return null;
    if (jid.contains('@lid') || jid.contains('@broadcast')) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0].replaceAll(RegExp(r'\D'), '');
    if (digits.length < 6 || digits.length > 15) return null;
    return '+$digits';
  }

  /// Auto-backfill for all connected employee accounts (fire-and-forget, run once per session)
  Future<void> _runAutoBackfillForAccounts() async {
    if (FirebaseAuth.instance.currentUser == null) return;
    if (_isBackfilling) return;

    try {
      // Get account details to check status
      final response = await _apiService.getAccounts();
      if (response['success'] != true) return;

      final accounts = (response['accounts'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();

      // Filter to only connected accounts that are in employee's allowed list
      final connectedAccountIds = accounts
          .where((acc) {
            final id = acc['id'] as String?;
            final status = acc['status'] as String?;
            return id != null &&
                _employeeAccountIds.contains(id) &&
                status == 'connected';
          })
          .map((acc) => acc['id'] as String?)
          .whereType<String>()
          .toList();

      if (connectedAccountIds.isEmpty) {
        if (kDebugMode) {
          debugPrint(
              '[EmployeeInboxScreen] No connected accounts for auto-backfill');
        }
        return;
      }

      // Run backfill for each connected account (fire-and-forget)
      for (final accountId in connectedAccountIds) {
        _apiService.backfillAccount(accountId: accountId).catchError((e, st) {
          if (kDebugMode) {
            debugPrint(
                '[EmployeeInboxScreen] Auto-backfill failed for $accountId: $e');
          }
          return <String, dynamic>{};
        });
      }

      if (kDebugMode) {
        debugPrint(
            '[EmployeeInboxScreen] Auto-backfill started for ${connectedAccountIds.length} account(s)');
      }
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('[EmployeeInboxScreen] Auto-backfill error: $e');
        debugPrint('[EmployeeInboxScreen] Stack trace: $st');
      }
    }
  }



  @override
  Widget build(BuildContext context) {
    final filtered = _threads.where((t) {
      if (_searchQuery.isEmpty) return true;
      final query = _searchQuery.toLowerCase();
      return t.displayName.toLowerCase().contains(query) ||
          (t.normalizedPhone ?? '').contains(query) ||
          t.lastMessageText.toLowerCase().contains(query);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Employee Inbox'),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() {
                _errorMessage = null;
                _firestoreErrorCode = null;
              });
              for (final sub in _threadSubscriptions.values) {
                sub.cancel();
              }
              _threadSubscriptions.clear();
              _threadsByAccount.clear();
              _startThreadListeners();
            },
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.error_outline,
                            size: 64, color: Colors.red[300]),
                        const SizedBox(height: 16),
                        Text(
                          _errorMessage!,
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.red[700]),
                        ),
                        if (_firestoreErrorCode != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Cod: $_firestoreErrorCode',
                            style: TextStyle(
                                fontSize: 12, color: Colors.grey[700]),
                          ),
                        ],
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadEmployeeAccounts,
                          child: const Text('Reîncearcă'),
                        ),
                      ],
                    ),
                  ),
                )
              : Column(
                  children: [
                    // Account selector dropdown
                    if (_employeeAccountIds.length > 1)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          border: Border(
                              bottom: BorderSide(color: Colors.grey[300]!)),
                        ),
                        child: DropdownButton<String>(
                          value: _selectedAccountId,
                          isExpanded: true,
                          hint: const Text('Selectează contul'),
                          items: _employeeAccountIds.map((accountId) {
                            // Show account ID (could be enhanced to show phone/name)
                            final shortId = accountId.length > 20
                                ? '${accountId.substring(0, 20)}...'
                                : accountId;
                            return DropdownMenuItem<String>(
                              value: accountId,
                              child: Text('Cont: $shortId'),
                            );
                          }).toList(),
                          onChanged: (String? newAccountId) {
                            if (newAccountId != null &&
                                newAccountId != _selectedAccountId) {
                              setState(() => _selectedAccountId = newAccountId);
                              _rebuildThreads();
                            }
                          },
                        ),
                      ),
                    // Search bar
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Caută conversații...',
                          prefixIcon: const Icon(Icons.search),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onChanged: (value) {
                          setState(() {
                            _searchQuery = value;
                          });
                        },
                      ),
                    ),
                    // Threads list
                    Expanded(
                      child: filtered.isEmpty
                          ? const Center(child: Text('Nu există conversații'))
                          : RefreshIndicator(
                              onRefresh: () async {
                                setState(() {
                                  _errorMessage = null;
                                  _firestoreErrorCode = null;
                                });
                                for (final sub in _threadSubscriptions.values) {
                                  sub.cancel();
                                }
                                _threadSubscriptions.clear();
                                _threadsByAccount.clear();
                                _startThreadListeners();
                              },
                              child: ListView.builder(
                                itemCount: filtered.length,
                                itemBuilder: (context, index) {
                                  final t = filtered[index];
                                  final effectiveThreadId = (t.redirectTo ?? '')
                                          .isNotEmpty
                                      ? t.redirectTo!
                                      : ((t.canonicalThreadId ?? '').isNotEmpty
                                          ? t.canonicalThreadId!
                                          : t.threadId);
                                  String timeText = '';
                                  if (t.lastMessageAt != null) {
                                    final now = DateTime.now();
                                    final diff =
                                        now.difference(t.lastMessageAt!);
                                    if (diff.inMinutes < 60) {
                                      timeText = '${diff.inMinutes}m ago';
                                    } else if (diff.inHours < 24) {
                                      timeText = '${diff.inHours}h ago';
                                    } else if (diff.inDays < 7) {
                                      timeText = DateFormat('EEE')
                                          .format(t.lastMessageAt!);
                                    } else {
                                      timeText = DateFormat('dd/MM')
                                          .format(t.lastMessageAt!);
                                    }
                                  }
                                  final ph = t.normalizedPhone ?? t.phone ?? '';
                                  final showPhone = ph.isNotEmpty &&
                                      (t.displayName.isEmpty ||
                                          t.displayName == ph ||
                                          RegExp(r'^\+?[\d\s\-\(\)]+$')
                                              .hasMatch(t.displayName));
                                  final subtitleParts = <String>[];
                                  if (showPhone) subtitleParts.add(ph);
                                  // Show last message or placeholder so "who wrote last" is always visible (fix mixed-up / no preview).
                                  final lastPreview = t.lastMessageText.trim().isNotEmpty
                                      ? t.lastMessageText
                                      : (t.lastMessageAt != null ? '[Mesaj]' : '');
                                  if (lastPreview.isNotEmpty) {
                                    if (subtitleParts.isNotEmpty)
                                      subtitleParts.add('•');
                                    // Show who wrote last: "Tu: " or "Nume: " so user sees sync (number wrote / I wrote).
                                    if (t.lastMessageDirection == 'outbound') {
                                      subtitleParts.add('Tu: $lastPreview');
                                    } else if (t.lastMessageSenderName != null && t.lastMessageSenderName!.trim().isNotEmpty) {
                                      subtitleParts.add('${t.lastMessageSenderName!.trim()}: $lastPreview');
                                    } else {
                                      subtitleParts.add(lastPreview);
                                    }
                                  }
                                  final subtitle = subtitleParts.isEmpty
                                      ? (ph.isNotEmpty ? ph : ' ')
                                      : subtitleParts.join(' ');

                                  return ListTile(
                                    leading: t.profilePictureUrl != null &&
                                            t.profilePictureUrl!.isNotEmpty
                                        ? CircleAvatar(
                                            backgroundImage:
                                                CachedNetworkImageProvider(
                                              t.profilePictureUrl!,
                                            ),
                                            onBackgroundImageError: (_, __) {},
                                          )
                                        : CircleAvatar(
                                            backgroundColor:
                                                const Color(0xFF25D366),
                                            child: Text(
                                              t.initial,
                                              style: const TextStyle(
                                                  color: Colors.white),
                                            ),
                                          ),
                                    title: Text(
                                      t.displayName.isNotEmpty
                                          ? t.displayName
                                          : (t.normalizedPhone ??
                                              t.phone ??
                                              ''),
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold),
                                      overflow: TextOverflow.ellipsis,
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
                                      ],
                                    ),
                                    onTap: () {
                                      context.go(
                                        '/whatsapp/chat?accountId=${Uri.encodeComponent(_selectedAccountId ?? '')}'
                                        '&threadId=${Uri.encodeComponent(effectiveThreadId)}'
                                        '&clientJid=${Uri.encodeComponent(t.clientJid)}'
                                        '&phoneE164=${Uri.encodeComponent(ph)}'
                                        '&displayName=${Uri.encodeComponent(t.displayName)}'
                                        '&returnRoute=${Uri.encodeComponent('/whatsapp/employee-inbox')}',
                                      );
                                    },
                                  );
                                },
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }
}
