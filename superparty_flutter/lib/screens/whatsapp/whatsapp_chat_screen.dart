import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/whatsapp_api_service.dart';

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

  String? get _accountId => widget.accountId ?? _extractFromQuery('accountId');
  String? get _threadId => widget.threadId ?? _extractFromQuery('threadId');
  String? get _clientJid => widget.clientJid ?? _extractFromQuery('clientJid');
  String? get _phoneE164 => widget.phoneE164 ?? _extractFromQuery('phoneE164');

  String? _extractFromQuery(String param) {
    final uri = Uri.base;
    return uri.queryParameters[param];
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _isSending || _accountId == null || _threadId == null || _clientJid == null) {
      return;
    }

    setState(() {
      _isSending = true;
    });

    try {
      final clientMessageId = 'client_${DateTime.now().millisecondsSinceEpoch}';
      
      await _apiService.sendViaProxy(
        threadId: _threadId!,
        accountId: _accountId!,
        toJid: _clientJid!,
        text: text,
        clientMessageId: clientMessageId,
      );

      if (mounted) {
        _messageController.clear();
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error sending message: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
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
          SnackBar(content: Text('Error extracting event: $e'), backgroundColor: Colors.red),
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
          const SnackBar(content: Text('Event saved successfully!'), backgroundColor: Colors.green),
        );
        setState(() {
          _draftEvent = null;
          _showCrmPanel = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving event: $e'), backgroundColor: Colors.red),
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

  @override
  Widget build(BuildContext context) {
    if (_threadId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Chat')),
        body: const Center(child: Text('ThreadId is required')),
      );
    }

    final displayName = _clientJid?.split('@')[0] ?? 'Unknown';

    return Scaffold(
      appBar: AppBar(
        title: Text(displayName),
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
                  .orderBy('tsClient', descending: false)
                  .limit(200)
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

                WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());

                return ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount: snapshot.data!.docs.length,
                  itemBuilder: (context, index) {
                    final doc = snapshot.data!.docs[index];
                    final data = doc.data() as Map<String, dynamic>;
                    
                    final direction = data['direction'] as String? ?? 'inbound';
                    final body = data['body'] as String? ?? '';
                    final status = data['status'] as String?;
                    final tsClient = data['tsClient'] as Timestamp?;

                    final isOutbound = direction == 'outbound';

                    return Align(
                      alignment: isOutbound ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.of(context).size.width * 0.7,
                        ),
                        decoration: BoxDecoration(
                          color: isOutbound ? const Color(0xFF25D366) : Colors.grey[200],
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              body,
                              style: TextStyle(
                                color: isOutbound ? Colors.white : Colors.black87,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (tsClient != null)
                                  Text(
                                    DateFormat('HH:mm').format(tsClient.toDate()),
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: isOutbound ? Colors.white70 : Colors.grey[600],
                                    ),
                                  ),
                                if (isOutbound && status != null) ...[
                                  const SizedBox(width: 4),
                                  Text(
                                    _getStatusIcon(status),
                                    style: const TextStyle(fontSize: 10),
                                  ),
                                ],
                              ],
                            ),
                          ],
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
                IconButton.filled(
                  onPressed: _isSending ? null : _sendMessage,
                  icon: _isSending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                  color: Colors.white,
                  backgroundColor: const Color(0xFF25D366),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
