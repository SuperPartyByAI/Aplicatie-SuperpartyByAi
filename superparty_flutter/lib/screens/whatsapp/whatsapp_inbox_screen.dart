import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/whatsapp_api_service.dart';

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
  bool _isLoadingAccounts = true;
  bool _isLoadingThreads = false;
  String _searchQuery = '';
  List<Map<String, dynamic>> _threads = [];
  String? _errorMessage;
  
  // Cache to prevent duplicate loads
  DateTime? _lastLoadTime;
  bool _isCurrentlyLoading = false;
  static const Duration _minRefreshInterval = Duration(seconds: 30);
  
  // Firestore thread streams (per account)
  final Map<String, StreamSubscription<QuerySnapshot>> _threadSubscriptions = {};
  final Map<String, List<Map<String, dynamic>>> _threadsByAccount = {};

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
    super.dispose();
  }

  void _startThreadListeners() {
    final accountIds = _accounts
        .map((account) => account['id'])
        .whereType<String>()
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet();

    final staleIds = _threadSubscriptions.keys.where((id) => !accountIds.contains(id)).toList();
    for (final accountId in staleIds) {
      _threadSubscriptions[accountId]?.cancel();
      _threadSubscriptions.remove(accountId);
      _threadsByAccount.remove(accountId);
    }

    for (final accountId in accountIds) {
      if (_threadSubscriptions.containsKey(accountId)) continue;

      final subscription = FirebaseFirestore.instance
          .collection('threads')
          .where('accountId', isEqualTo: accountId)
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
              ...doc.data() as Map<String, dynamic>,
              'accountId': accountId,
              'accountName': accountName,
            };
          }).toList();
          _threadsByAccount[accountId] = threads;
          _rebuildThreadsFromCache();
        },
        onError: (error) {
          debugPrint('[WhatsAppInboxScreen] Thread stream error ($accountId): $error');
        },
      );

      _threadSubscriptions[accountId] = subscription;
    }
  }

  void _rebuildThreadsFromCache() {
    final allThreads = _threadsByAccount.values.expand((list) => list).toList();
    final dedupedThreads = _filterAndDedupeThreads(allThreads);

    if (mounted) {
      setState(() {
        _threads = dedupedThreads;
        _isLoadingThreads = false;
        _isCurrentlyLoading = false;
      });
    }
  }

  List<Map<String, dynamic>> _filterAndDedupeThreads(List<Map<String, dynamic>> allThreads) {
    String readString(dynamic value, {List<String> mapKeys = const []}) {
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

    DateTime? resolveThreadTime(Map<String, dynamic> thread) {
      if (thread['lastMessageAtMs'] is int) {
        return DateTime.fromMillisecondsSinceEpoch(thread['lastMessageAtMs'] as int);
      }
      if (thread['lastMessageAt'] != null) {
        final ts = thread['lastMessageAt'] as Map<String, dynamic>?;
        if (ts?['_seconds'] != null) {
          return DateTime.fromMillisecondsSinceEpoch((ts!['_seconds'] as int) * 1000);
        }
      } else if (thread['lastMessageTimestamp'] is int) {
        return DateTime.fromMillisecondsSinceEpoch((thread['lastMessageTimestamp'] as int) * 1000);
      }
      return null;
    }

    final visibleThreads = allThreads.where((thread) {
      final hidden = thread['hidden'] == true || thread['archived'] == true;
      final redirectTo = readString(thread['redirectTo']).trim();
      final clientJid = readString(
        thread['clientJid'],
        mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
      ).trim();
      final isLid = clientJid.endsWith('@lid');
      final isBroadcast = clientJid.endsWith('@broadcast');
      if (hidden) return false;
      if (redirectTo.isNotEmpty) return false;
      if (isLid) return false;
      if (isBroadcast) return false;
      return true;
    }).toList();

    visibleThreads.sort((a, b) {
      final timeA = resolveThreadTime(a);
      final timeB = resolveThreadTime(b);
      if (timeA == null && timeB == null) return 0;
      if (timeA == null) return 1;
      if (timeB == null) return -1;
      return timeB.compareTo(timeA);
    });

    final dedupedByPhone = <String, Map<String, dynamic>>{};
    for (final thread in visibleThreads) {
      final normalizedPhone = readString(thread['normalizedPhone']).trim();
      final clientJid = readString(
        thread['clientJid'],
        mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
      ).trim();
      final threadId = readString(thread['id'], mapKeys: const ['threadId', 'id']).trim();
      final key = normalizedPhone.isNotEmpty
          ? normalizedPhone
          : (threadId.isNotEmpty ? threadId : clientJid);
      dedupedByPhone.putIfAbsent(key, () => thread);
    }
    return dedupedByPhone.values.toList();
  }

  Future<void> _loadThreads() async {
    // Prevent duplicate loads within 2 seconds
    if (_isCurrentlyLoading) {
      debugPrint('[WhatsAppInboxScreen] Already loading, skipping duplicate request');
      return;
    }
    
    final now = DateTime.now();
    if (_lastLoadTime != null && now.difference(_lastLoadTime!) < _minRefreshInterval) {
      debugPrint('[WhatsAppInboxScreen] Too soon since last load, skipping');
      return;
    }
    
    _isCurrentlyLoading = true;
    _lastLoadTime = now;
    
    final availableAccounts = _accounts.toList();
    
    if (availableAccounts.isEmpty) {
      if (mounted) {
        setState(() {
          _threads = [];
          _isLoadingThreads = false;
          _errorMessage = 'No available accounts found';
          _isCurrentlyLoading = false;
        });
      }
      return;
    }
    
    setState(() {
      _isLoadingThreads = true;
      _errorMessage = null;
    });

    try {
      // Load threads from all available accounts in parallel
      final futures = availableAccounts.map((account) async {
        final accountId = account['id'] as String?;
        if (accountId == null) return <Map<String, dynamic>>[];
        
        try {
          final response = await _apiService.getThreads(accountId: accountId);
          
          if (response['success'] == true) {
            final threads = (response['threads'] as List<dynamic>? ?? [])
                .cast<Map<String, dynamic>>();
            // Add accountId and account name to each thread
            return threads.map((thread) {
              return {
                ...thread,
                'accountId': accountId,
                'accountName': account['name'] as String? ?? accountId,
              };
            }).toList();
          }
        } catch (e) {
          final accountHash = accountId.hashCode.toRadixString(16);
          debugPrint('[WhatsAppInboxScreen] Error loading threads for account $accountHash: $e');
        }
        return <Map<String, dynamic>>[];
      });

      final allThreadsLists = await Future.wait(futures);
      final allThreads = allThreadsLists.expand((list) => list).toList();
      
      final dedupedThreads = _filterAndDedupeThreads(allThreads);
      
      if (mounted) {
        setState(() {
          _threads = dedupedThreads;
          _isLoadingThreads = false;
          _isCurrentlyLoading = false;
        });
      }
    } catch (e) {
      debugPrint('[WhatsAppInboxScreen] Error loading threads: $e');
      if (mounted) {
        setState(() {
          _errorMessage = 'Error loading threads: ${e.toString()}';
          _isLoadingThreads = false;
          _isCurrentlyLoading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
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
            // Start Firestore listeners for real-time updates
            _startThreadListeners();
            // Manual refresh fallback (uses Functions proxy)
            _loadThreads();
          });
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

  String? _extractPhoneFromJid(String? jid) {
    if (jid == null) return null;
    if (jid.contains('@lid') || jid.contains('@broadcast')) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0];
    if (digits.length > 15 || !RegExp(r'^\d{6,15}$').hasMatch(digits)) return null;
    return '+$digits';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp Inbox'),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _loadAccounts();
              _loadThreads();
            },
            tooltip: 'Refresh',
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
                                  onPressed: _loadThreads,
                                  child: const Text('Retry'),
                                ),
                              ],
                            ),
                          )
                            : _threads.isEmpty
                            ? const Center(
                                child: Text('No conversations found'),
                              )
                            : Builder(
                                builder: (context) {
                                  // Filter threads by search query
                                  final filteredThreads = _threads.where((thread) {
                                    if (_searchQuery.isEmpty) return true;
                                    final clientJid = (thread['clientJid'] as String? ?? '').toLowerCase();
                                    final displayName = (thread['displayName'] as String? ?? '').toLowerCase();
                                    final lastMessageText = (thread['lastMessageText'] as String? ?? '').toLowerCase();
                                    final normalizedPhone = (thread['normalizedPhone'] as String? ?? '').toLowerCase();
                                    final phone = normalizedPhone.isNotEmpty
                                        ? normalizedPhone
                                        : (_extractPhoneFromJid(thread['clientJid'] as String?)?.toLowerCase() ?? '');
                                    return clientJid.contains(_searchQuery) ||
                                        displayName.contains(_searchQuery) ||
                                        lastMessageText.contains(_searchQuery) ||
                                        phone.contains(_searchQuery);
                                  }).toList();

                                  if (filteredThreads.isEmpty) {
                                    return const Center(
                                      child: Text('No conversations match search query'),
                                    );
                                  }

                                  return RefreshIndicator(
                                    onRefresh: _loadThreads,
                                    child: ListView.builder(
                                      itemCount: filteredThreads.length,
                                      itemBuilder: (context, index) {
                                        final thread = filteredThreads[index];
                                        final threadId = thread['id'] as String? ?? '';
                                        final redirectTo = thread['redirectTo'] as String?;
                                        final accountId = thread['accountId'] as String? ?? '';
                                        final accountName = thread['accountName'] as String? ?? '';
                                        final clientJid = thread['clientJid'] as String? ?? '';
                                        final rawDisplayName = thread['displayName'] as String? ?? '';
                                        final lastMessageText = thread['lastMessageText'] as String? ?? '';
                                        final normalizedPhone = thread['normalizedPhone'] as String?;
                                        
                                        // Extract phone from clientJid
                                        final phone = normalizedPhone ?? _extractPhoneFromJid(clientJid);
                                        final isBroadcast = clientJid.endsWith('@broadcast');
                                        
                                        // DEBUG: Print raw data to see what we receive
                                        if (index == 0) {
                                          debugPrint('[Inbox] Sample thread data: clientJid=$clientJid, rawDisplayName=$rawDisplayName, phone=$phone');
                                        }
                                        
                                        // Smart display name logic:
                                        // Always use formatted phone from clientJid for consistency
                                        String displayName = rawDisplayName.trim();
                                        
                                        // If displayName is empty or looks like a number/JID, use formatted phone
                                        if (!isBroadcast && phone != null && phone.isNotEmpty) {
                                          // Check if rawDisplayName is just a messy number or empty
                                          final isMixedFormat = displayName.isEmpty ||
                                              displayName.contains('@') ||
                                              RegExp(r'^\+?[\d\s\-\(\)]{10,}$').hasMatch(displayName);
                                          
                                          if (isMixedFormat) {
                                            // Use formatted phone number
                                            // Try international format: +[country][area][number]
                                            var formatted = phone.replaceAllMapped(
                                              RegExp(r'^\+(\d{1,4})(\d{3})(\d{3})(\d{3,})$'),
                                              (match) => '+${match[1]} ${match[2]} ${match[3]} ${match[4]}',
                                            );
                                            
                                            // If regex didn't match (formatted == phone), try simpler split
                                            if (formatted == phone && phone.length > 4) {
                                              // Just split every 3 digits after country code
                                              if (phone.startsWith('+')) {
                                                final digits = phone.substring(1);
                                                final parts = <String>[];
                                                for (int i = 0; i < digits.length; i += 3) {
                                                  parts.add(digits.substring(i, (i + 3).clamp(0, digits.length)));
                                                }
                                                formatted = '+${parts.join(' ')}';
                                              } else {
                                                formatted = phone;
                                              }
                                            }
                                            
                                            displayName = formatted;
                                            debugPrint('[Inbox] Formatted displayName: $displayName (from phone: $phone)');
                                          }
                                        }
                                        
                                        // Parse lastMessageAt timestamp
                                        DateTime? lastMessageAt;
                                        if (thread['lastMessageAt'] != null) {
                                          final ts = thread['lastMessageAt'] as Map<String, dynamic>?;
                                          if (ts?['_seconds'] != null) {
                                            lastMessageAt = DateTime.fromMillisecondsSinceEpoch(
                                              (ts!['_seconds'] as int) * 1000,
                                            );
                                          }
                                        }
                                        
                                        // Don't show phone in subtitle if it's already the displayName
                                        String? displayPhone;
                                        if (phone != null &&
                                            !displayName.contains(phone.replaceAll('+', '').replaceAll(' ', ''))) {
                                          displayPhone = phone.replaceAllMapped(
                                            RegExp(r'^\+?(\d{1,3})(\d{3})(\d{3})(\d+)$'),
                                            (match) => '+${match[1]} ${match[2]} ${match[3]} ${match[4]}',
                                          );
                                        }
                                        
                                        // Format timestamp
                                        String timeText = '';
                                        if (lastMessageAt != null) {
                                          final now = DateTime.now();
                                          final diff = now.difference(lastMessageAt);
                                          
                                          if (diff.inMinutes < 60) {
                                            timeText = '${diff.inMinutes}m ago';
                                          } else if (diff.inHours < 24) {
                                            timeText = '${diff.inHours}h ago';
                                          } else if (diff.inDays < 7) {
                                            timeText = DateFormat('EEE').format(lastMessageAt);
                                          } else {
                                            timeText = DateFormat('dd/MM').format(lastMessageAt);
                                          }
                                        }

                                        return ListTile(
                                          leading: CircleAvatar(
                                            backgroundColor: const Color(0xFF25D366),
                                            child: Text(
                                              displayName.isNotEmpty 
                                                  ? displayName[0].toUpperCase() 
                                                  : '?',
                                              style: const TextStyle(color: Colors.white),
                                            ),
                                          ),
                                          title: Row(
                                            children: [
                                              Expanded(
                                                flex: 3,
                                                child: Text(
                                                  displayName,
                                                  style: const TextStyle(fontWeight: FontWeight.bold),
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ),
                                              if (accountName.isNotEmpty) ...[
                                                const SizedBox(width: 4),
                                                Flexible(
                                                  flex: 1,
                                                  child: Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: Colors.blue[100],
                                                      borderRadius: BorderRadius.circular(4),
                                                    ),
                                                    child: Text(
                                                      accountName,
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
                                          subtitle: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              if (displayPhone != null && displayPhone.isNotEmpty) 
                                                Text(
                                                  displayPhone, 
                                                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                                                ),
                                              if (lastMessageText.isNotEmpty)
                                                Text(
                                                  lastMessageText,
                                                  maxLines: 2,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: const TextStyle(fontSize: 13),
                                                ),
                                            ],
                                          ),
                                          trailing: timeText.isNotEmpty
                                              ? Text(
                                                  timeText,
                                                  style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                                                )
                                              : null,
                                          onTap: () {
                                            final encodedDisplayName = Uri.encodeComponent(displayName);
                                            final effectiveThreadId =
                                                (redirectTo != null && redirectTo.isNotEmpty)
                                                    ? redirectTo
                                                    : threadId;
                                            context.go(
                                              '/whatsapp/chat?accountId=${Uri.encodeComponent(accountId)}'
                                              '&threadId=${Uri.encodeComponent(effectiveThreadId)}'
                                              '&clientJid=${Uri.encodeComponent(clientJid)}'
                                              '&phoneE164=${Uri.encodeComponent(phone ?? '')}'
                                              '&displayName=$encodedDisplayName',
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
