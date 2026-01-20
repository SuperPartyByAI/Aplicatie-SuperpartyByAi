import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/whatsapp_api_service.dart';

String getDisplayInitial(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) {
    return '?';
  }
  return trimmed[0].toUpperCase();
}

/// WhatsApp Chat Screen - Messages + Send + CRM Panel
class WhatsAppChatScreen extends StatefulWidget {
  final String? accountId;
  final String? threadId;
  final String? clientJid;
  final String? phoneE164;

  const WhatsAppChatScreen({
    super.key,
    this.accountId,
    this.threadId,
    this.clientJid,
    this.phoneE164,
  });

  @override
  State<WhatsAppChatScreen> createState() => _WhatsAppChatScreenState();
}

class _WhatsAppChatScreenState extends State<WhatsAppChatScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isSending = false;
  bool _showCrmPanel = false;
  Map<String, dynamic>? _draftEvent;
  int _previousMessageCount = 0; // Track message count to detect new messages
  DateTime? _lastSendAt;
  String? _lastSentText;
  int _sendCounter = 0;
  bool _initialScrollDone = false;
  bool _redirectChecked = false;

  String? get _accountId => widget.accountId ?? _extractFromQuery('accountId');
  String? get _threadId => widget.threadId ?? _extractFromQuery('threadId');
  String? get _clientJid => widget.clientJid ?? _extractFromQuery('clientJid');
  String? get _phoneE164 => widget.phoneE164 ?? _extractFromQuery('phoneE164');
  String? get _displayName => _extractFromQuery('displayName');

  String? _extractFromQuery(String param) {
    final uri = Uri.base;
    return uri.queryParameters[param];
  }

  @override
  void initState() {
    super.initState();
    _ensureCanonicalThread();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _ensureCanonicalThread() async {
    if (_redirectChecked) return;
    _redirectChecked = true;
    if (_threadId == null || _accountId == null) {
      return;
    }

    try {
      final threadDoc = await FirebaseFirestore.instance
          .collection('threads')
          .doc(_threadId!)
          .get();
      if (!threadDoc.exists) {
        return;
      }

      final data = threadDoc.data() ?? <String, dynamic>{};
      final redirectTo = data['redirectTo'] as String?;
      final canonicalThreadId = data['canonicalThreadId'] as String?;
      final clientJid = (data['clientJid'] as String? ?? '').trim();
      final isLid = clientJid.endsWith('@lid');
      final targetThreadId = redirectTo?.isNotEmpty == true ? redirectTo : canonicalThreadId;

      if ((isLid || redirectTo != null) && targetThreadId != null && targetThreadId != _threadId) {
        final targetDoc = await FirebaseFirestore.instance
            .collection('threads')
            .doc(targetThreadId)
            .get();
        if (!targetDoc.exists) {
          return;
        }

        final targetData = targetDoc.data() ?? <String, dynamic>{};
        final targetClientJid = targetData['clientJid'] as String? ?? '';
        final targetPhone = targetData['normalizedPhone'] as String?;
        final displayName = targetData['displayName'] as String? ?? '';

        if (mounted) {
          final encodedDisplayName = Uri.encodeComponent(displayName);
          context.go(
            '/whatsapp/chat?accountId=${Uri.encodeComponent(_accountId!)}'
            '&threadId=${Uri.encodeComponent(targetThreadId)}'
            '&clientJid=${Uri.encodeComponent(targetClientJid)}'
            '&phoneE164=${Uri.encodeComponent(targetPhone ?? '')}'
            '&displayName=$encodedDisplayName',
          );
        }
      }
    } catch (e) {
      debugPrint('[ChatScreen] Redirect check failed: $e');
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message cannot be empty')),
      );
      return;
    }
    
    if (_isSending) return;
    if (_lastSendAt != null &&
        _lastSentText == text &&
        DateTime.now().difference(_lastSendAt!).inMilliseconds < 1500) {
      debugPrint('[ChatScreen] Skipping duplicate send (cooldown)');
      return;
    }
    
    if (_accountId == null || _threadId == null || _clientJid == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Missing required data: accountId=$_accountId, threadId=$_threadId, clientJid=$_clientJid')),
      );
      return;
    }

    _isSending = true;
    setState(() {});
    _lastSendAt = DateTime.now();
    _lastSentText = text;

    try {
      final now = DateTime.now();
      final clientMessageId = 'client_${now.millisecondsSinceEpoch}_${_sendCounter++}';
      
      debugPrint('[ChatScreen] Sending message: text=$text, accountId=$_accountId, threadId=$_threadId, clientJid=$_clientJid');
      
      final result = await _apiService.sendViaProxy(
        threadId: _threadId!,
        accountId: _accountId!,
        toJid: _clientJid!,
        text: text,
        clientMessageId: clientMessageId,
      );

      debugPrint('[ChatScreen] Message sent successfully: $result');

      if (mounted) {
        _messageController.clear();
        _scrollToBottom(force: true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message sent!'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      debugPrint('[ChatScreen] Error sending message: $e');
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error sending message: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  void _scrollToBottom({bool force = false}) {
    if (!_scrollController.hasClients) return;
    final nearBottom = _scrollController.offset < 200;
    if (!force && !nearBottom) return;
    _scrollController.animateTo(
      _scrollController.position.minScrollExtent,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  int? _extractTsMillis(dynamic tsClientRaw) {
    if (tsClientRaw is Timestamp) {
      return tsClientRaw.millisecondsSinceEpoch;
    }
    if (tsClientRaw is String) {
      try {
        return DateTime.parse(tsClientRaw).millisecondsSinceEpoch;
      } catch (_) {
        return null;
      }
    }
    if (tsClientRaw is int) {
      return tsClientRaw;
    }
    return null;
  }

  List<QueryDocumentSnapshot> _dedupeMessageDocs(List<QueryDocumentSnapshot> docs) {
    final byKey = <String, QueryDocumentSnapshot>{};
    for (final doc in docs) {
      final data = doc.data() as Map<String, dynamic>;
      final waMessageId = data['waMessageId'] as String?;
      final clientMessageId = data['clientMessageId'] as String?;
      final direction = data['direction'] as String? ?? 'inbound';
      final body = (data['body'] as String? ?? '').trim();
      final tsMillis = _extractTsMillis(data['tsClient']);
      final tsRounded = tsMillis != null ? (tsMillis / 1000).floor() : null;
      final fallbackKey = 'fallback:$direction|$body|$tsRounded';

      final primaryKey = waMessageId?.isNotEmpty == true
          ? 'wa:$waMessageId'
          : (clientMessageId?.isNotEmpty == true ? 'client:$clientMessageId' : fallbackKey);

      if (byKey.containsKey(primaryKey)) {
        continue;
      }

      final existing = byKey[fallbackKey];
      if (existing != null) {
        final existingData = existing.data() as Map<String, dynamic>;
        final existingHasWa = (existingData['waMessageId'] as String?)?.isNotEmpty == true;
        final currentHasWa = waMessageId?.isNotEmpty == true;
        if (existingHasWa && !currentHasWa) {
          continue;
        }
        if (!existingHasWa && currentHasWa) {
          byKey[fallbackKey] = doc;
          byKey[primaryKey] = doc;
          continue;
        }
      }

      byKey[primaryKey] = doc;
      byKey.putIfAbsent(fallbackKey, () => doc);
    }
    return byKey.values.toList();
  }

  Future<void> _extractEvent() async {
    if (_threadId == null || _accountId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ThreadId and AccountId are required')),
      );
      return;
    }

    setState(() => _showCrmPanel = true);

    try {
      final result = await _apiService.extractEventFromThread(
        threadId: _threadId!,
        accountId: _accountId!,
        phoneE164: _phoneE164,
        dryRun: true,
      );

      if (mounted) {
        if (result['action'] == 'NOOP') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result['reasons']?.join(', ') ?? 'No booking intent detected'),
              backgroundColor: Colors.orange,
            ),
          );
        } else {
          setState(() {
            _draftEvent = result['draftEvent'] as Map<String, dynamic>?;
          });
          _showEventDraftDialog();
        }
      }
    } catch (e) {
      if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error extracting event: $e')),
          );
      }
    }
  }

  Future<void> _saveEvent(Map<String, dynamic> eventData) async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw Exception('User not authenticated');
      }

      final firestore = FirebaseFirestore.instance;
      
      await firestore.collection('evenimente').add({
        'createdBy': user.uid,
        'accountId': _accountId,
        'threadId': _threadId,
        'phoneE164': _phoneE164 ?? _extractPhoneFromJid(_clientJid),
        'phoneRaw': _phoneE164?.replaceAll('+', '') ?? _extractPhoneFromJid(_clientJid)?.replaceAll('+', ''),
        'isArchived': false,
        'schemaVersion': 3,
        'date': eventData['date'],
        'address': eventData['address'],
        'childName': eventData['childName'],
        'childAge': eventData['childAge'],
        'payment': eventData['payment'] ?? {'status': 'UNPAID'},
        'rolesBySlot': eventData['rolesBySlot'] ?? {},
        'createdAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Event saved successfully!')),
        );
        setState(() {
          _draftEvent = null;
          _showCrmPanel = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving event: $e')),
        );
      }
    }
  }

  String? _extractPhoneFromJid(String? jid) {
    if (jid == null) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0];
    return digits.startsWith('+') ? digits : '+$digits';
  }

  void _showEventDraftDialog() {
    if (_draftEvent == null) return;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Event Draft'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_draftEvent!['date'] != null)
                Text('Date: ${_draftEvent!['date']}'),
              if (_draftEvent!['address'] != null)
                Text('Address: ${_draftEvent!['address']}'),
              if (_draftEvent!['childName'] != null)
                Text('Child: ${_draftEvent!['childName']}'),
              if (_draftEvent!['payment'] != null)
                Text('Payment: ${_draftEvent!['payment']}'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              _saveEvent(_draftEvent!);
            },
            child: const Text('Save Event'),
          ),
        ],
      ),
    );
  }

  String _getStatusIcon(String? status) {
    switch (status?.toLowerCase()) {
      case 'queued':
        return '⏳';
      case 'sent':
        return '✓';
      case 'delivered':
        return '✓✓';
      case 'read':
        return '✓✓✓';
      default:
        return '';
    }
  }

  // Get display name from thread or clientJid
  String get displayName {
    if (_displayName != null && _displayName!.trim().isNotEmpty) {
      return _displayName!.trim();
    }
    // Try to extract a readable name from clientJid first
    if (_clientJid != null) {
      final jidPart = _clientJid!.split('@')[0];
      // If it's not just a phone number (has letters), use it
      if (jidPart.contains(RegExp(r'[a-zA-Z]'))) {
        return jidPart;
      }
    }
    
    // Otherwise, try to format phone number nicely
    final phone = _phoneE164 ?? _extractPhoneFromJid(_clientJid);
    if (phone != null) {
      // Format phone number: +40 123 456 789
      return phone.replaceAllMapped(
        RegExp(r'^\+(\d{1,3})(\d{3})(\d{3})(\d+)$'),
        (match) => '+${match[1]} ${match[2]} ${match[3]} ${match[4]}',
      );
    }
    
    return 'Unknown';
  }

  @override
  Widget build(BuildContext context) {
    if (_threadId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Chat')),
        body: const Center(child: Text('ThreadId is required')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            // Navigate back to WhatsApp inbox
            context.go('/whatsapp/inbox');
          },
        ),
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: Colors.white.withOpacity(0.3),
              child: Text(
                getDisplayInitial(displayName),
                style: const TextStyle(color: Colors.white),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    displayName,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  if (_phoneE164 != null || _extractPhoneFromJid(_clientJid) != null)
                    Text(
                      _phoneE164 ?? _extractPhoneFromJid(_clientJid) ?? '',
                      style: const TextStyle(fontSize: 12, color: Colors.white70),
                    ),
                ],
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          IconButton(
            icon: Icon(_showCrmPanel ? Icons.expand_less : Icons.expand_more),
            onPressed: () {
              setState(() => _showCrmPanel = !_showCrmPanel);
            },
            tooltip: 'Toggle CRM Panel',
          ),
        ],
      ),
      body: Column(
        children: [
          // CRM Panel (collapsible)
          if (_showCrmPanel)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _extractEvent,
                      icon: const Icon(Icons.auto_awesome, size: 18),
                      label: const Text('Extract Event'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (_phoneE164 != null || _extractPhoneFromJid(_clientJid) != null)
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          final phone = _phoneE164 ?? _extractPhoneFromJid(_clientJid);
                          if (phone != null) {
                            context.go('/whatsapp/client?phoneE164=${Uri.encodeComponent(phone)}');
                          }
                        },
                        icon: const Icon(Icons.person, size: 18),
                        label: const Text('Client Profile'),
                      ),
                    ),
                ],
              ),
            ),

          // Messages list
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('threads')
                  .doc(_threadId!)
                  .collection('messages')
                  .orderBy('tsClient', descending: true)
                  .limit(500)
                  .snapshots(),
              builder: (context, snapshot) {
                
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  return Center(child: Text('Error: ${snapshot.error}'));
                }

                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  return const Center(child: Text('No messages yet'));
                }

                final dedupedDocs = _dedupeMessageDocs(snapshot.data!.docs);
                final currentMessageCount = dedupedDocs.length;
                final hasNewMessages = currentMessageCount > _previousMessageCount;
                
                if (!_initialScrollDone && dedupedDocs.isNotEmpty) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _scrollToBottom(force: true);
                  });
                  _initialScrollDone = true;
                } else if (hasNewMessages) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _scrollToBottom();
                  });
                }
                _previousMessageCount = currentMessageCount;

                return ListView.builder(
                  controller: _scrollController,
                  key: PageStorageKey('whatsapp-chat-${_threadId ?? ''}'),
                  reverse: true,
                  padding: const EdgeInsets.all(16),
                  itemCount: dedupedDocs.length,
                  itemBuilder: (context, index) {
                    
                    final doc = dedupedDocs[index];
                    final data = doc.data() as Map<String, dynamic>;
                    final messageKey = data['waMessageId'] as String? ??
                        data['clientMessageId'] as String? ??
                        doc.id;
                    
                    final direction = data['direction'] as String? ?? 'inbound';
                    final body = data['body'] as String? ?? '';
                    final status = data['status'] as String?;
                    
                    // Handle tsClient - it might be a Timestamp, String, or int
                    Timestamp? tsClient;
                    final tsClientRaw = data['tsClient'];
                    if (tsClientRaw is Timestamp) {
                      tsClient = tsClientRaw;
                    } else if (tsClientRaw is String) {
                      try {
                        // Try parsing ISO8601 string
                        final dateTime = DateTime.parse(tsClientRaw);
                        tsClient = Timestamp.fromDate(dateTime);
                      } catch (e) {
                        // If parsing fails, tsClient remains null
                        tsClient = null;
                      }
                    } else if (tsClientRaw is int) {
                      // Unix timestamp in milliseconds
                      tsClient = Timestamp.fromMillisecondsSinceEpoch(tsClientRaw);
                    }

                    final isOutbound = direction == 'outbound';

                    // Format timestamp
                    String timeText = '';
                    if (tsClient != null) {
                      final now = DateTime.now();
                      final msgTime = tsClient.toDate();
                      final diff = now.difference(msgTime);
                      
                      if (diff.inDays == 0) {
                        // Today - show only time
                        timeText = DateFormat('HH:mm').format(msgTime);
                      } else if (diff.inDays == 1) {
                        // Yesterday
                        timeText = 'Ieri ${DateFormat('HH:mm').format(msgTime)}';
                      } else if (diff.inDays < 7) {
                        // This week - show day name
                        timeText = DateFormat('EEE HH:mm').format(msgTime);
                      } else {
                        // Older - show date
                        timeText = DateFormat('dd/MM/yyyy HH:mm').format(msgTime);
                      }
                    }
                    
                    return KeyedSubtree(
                      key: ValueKey(messageKey),
                      child: Align(
                        alignment: isOutbound ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 4, left: 48, right: 48),
                          child: Row(
                            mainAxisAlignment: isOutbound ? MainAxisAlignment.end : MainAxisAlignment.start,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              // Avatar for inbound messages (left side)
                              if (!isOutbound) ...[
                                CircleAvatar(
                                  radius: 16,
                                  backgroundColor: Colors.grey[300],
                                  child: Text(
                                    getDisplayInitial(displayName),
                                    style: const TextStyle(fontSize: 12, color: Colors.black87),
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              // Message bubble
                              Flexible(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  constraints: BoxConstraints(
                                    maxWidth: MediaQuery.of(context).size.width * 0.65,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isOutbound ? const Color(0xFF25D366) : Colors.white,
                                    borderRadius: BorderRadius.only(
                                      topLeft: const Radius.circular(8),
                                      topRight: const Radius.circular(8),
                                      bottomLeft: Radius.circular(isOutbound ? 8 : 0),
                                      bottomRight: Radius.circular(isOutbound ? 0 : 8),
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withOpacity(0.05),
                                        blurRadius: 1,
                                        offset: const Offset(0, 1),
                                      ),
                                    ],
                                    border: isOutbound ? null : Border.all(color: Colors.grey[200]!),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        body,
                                        style: TextStyle(
                                          color: isOutbound ? Colors.white : Colors.black87,
                                          fontSize: 15,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          if (timeText.isNotEmpty)
                                            Text(
                                              timeText,
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: isOutbound ? Colors.white70 : Colors.grey[600],
                                              ),
                                            ),
                                          if (isOutbound && status != null) ...[
                                            const SizedBox(width: 4),
                                            Text(
                                              _getStatusIcon(status),
                                              style: const TextStyle(fontSize: 12),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              // Spacing for outbound messages (before avatar area)
                              if (isOutbound) ...[
                                const SizedBox(width: 48), // Match avatar width for alignment
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),

          // Send input
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: Colors.grey[300]!)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _isSending ? null : _sendMessage,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366),
                    padding: const EdgeInsets.all(12),
                  ),
                  child: _isSending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send, color: Colors.white),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
