import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/whatsapp_api_service.dart';
import '../../core/auth/is_super_admin.dart';
import 'whatsapp_permissions.dart';
import 'whatsapp_delivery.dart';

class WhatsAppChatScreen extends StatefulWidget {
  final String threadId;
  final String accountId;
  final String chatId;
  final String title;

  const WhatsAppChatScreen({
    super.key,
    required this.threadId,
    required this.accountId,
    required this.chatId,
    required this.title,
  });

  @override
  State<WhatsAppChatScreen> createState() => _WhatsAppChatScreenState();
}

class _WhatsAppChatScreenState extends State<WhatsAppChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  bool _sending = false;
  bool _canSend = true;
  String? _sendBlockedReason;
  DocumentSnapshot<Map<String, dynamic>>? _lastOlderDoc;
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> _older = [];
  bool _loadingMore = false;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _markRead();
  }

  Future<void> _markRead() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('whatsapp_thread_prefs')
        .doc(widget.threadId)
        .set({'lastReadAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Query<Map<String, dynamic>> _baseQuery() {
    return FirebaseFirestore.instance
        .collection('whatsapp_messages')
        .where('threadId', isEqualTo: widget.threadId)
        .orderBy('timestamp', descending: true);
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      Query<Map<String, dynamic>> q = _baseQuery().limit(50);
      if (_lastOlderDoc != null) {
        q = q.startAfterDocument(_lastOlderDoc!);
      }
      final snap = await q.get();
      if (snap.docs.isEmpty) {
        _hasMore = false;
        return;
      }
      _lastOlderDoc = snap.docs.last;
      _older.addAll(snap.docs);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    if (!_canSend) return;
    setState(() => _sending = true);
    try {
      final clientMessageId = DateTime.now().microsecondsSinceEpoch.toString();
      await WhatsAppApiService.instance.send(
        threadId: widget.threadId,
        accountId: widget.accountId,
        to: widget.chatId,
        chatId: widget.chatId,
        text: text,
        clientMessageId: clientMessageId,
      );
      _input.clear();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Nu pot trimite mesajul: $e')),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final stream = _baseQuery().limit(50).snapshots();
    final threadStream = FirebaseFirestore.instance
        .collection('whatsapp_threads')
        .doc(widget.threadId)
        .snapshots();

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            onPressed: _loadingMore ? null : _loadMore,
            icon: const Icon(Icons.history),
            tooltip: 'Load more',
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              stream: threadStream,
              builder: (context, threadSnap) {
                final thread = threadSnap.data?.data();
                final uid = FirebaseAuth.instance.currentUser?.uid;
                final isSuper = isSuperAdmin(FirebaseAuth.instance.currentUser);
                final ownerUid = (thread?['ownerUid'] ?? '').toString();
                final locked = thread?['locked'] == true;
                final coWriters = (thread?['coWriterUids'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
                final canSend = canSendToThread(
                  currentUid: uid,
                  isSuperAdmin: isSuper,
                  ownerUid: ownerUid.isEmpty ? null : ownerUid,
                  coWriterUids: coWriters,
                  locked: locked,
                );

                _canSend = canSend;
                _sendBlockedReason = locked
                    ? 'Thread locked'
                    : (!isSuper && ownerUid.isNotEmpty && ownerUid != uid && !coWriters.contains(uid))
                        ? 'Doar owner/co-writer poate trimite'
                        : null;

                return Column(
                  children: [
                    if (_sendBlockedReason != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.orange.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.orange.shade200),
                          ),
                          child: Text(_sendBlockedReason!),
                        ),
                      ),
                    Expanded(
                      child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                        stream: stream,
                        builder: (context, snap) {
                if (snap.hasError) {
                  return Center(child: Text('Eroare: ${snap.error}'));
                }
                if (!snap.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                // newest->oldest
                final newest = snap.data!.docs;
                // Merge: newest + older pages
                final all = <QueryDocumentSnapshot<Map<String, dynamic>>>[
                  ...newest,
                  ..._older,
                ];
                // Deduplicate by doc id (stream updates can re-emit)
                final seen = <String>{};
                final dedup = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
                for (final d in all) {
                  if (seen.add(d.id)) dedup.add(d);
                }

                // Display oldest->newest
                final msgs = dedup.reversed.where((d) {
                  final m = d.data();
                  final replacedBy = (m['replacedBy'] ?? '').toString();
                  // Hide placeholder message once replaced by canonical WA message.
                  return replacedBy.isEmpty;
                }).toList();

                return ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  itemCount: msgs.length + 1,
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return _hasMore
                          ? Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: OutlinedButton(
                                onPressed: _loadingMore ? null : _loadMore,
                                child: Text(_loadingMore ? 'Loading...' : 'Load more'),
                              ),
                            )
                          : const SizedBox(height: 8);
                    }
                    final d = msgs[i - 1];
                    final m = d.data();
                    final direction = (m['direction'] ?? '').toString();
                    final isOut = direction == 'out';
                    final text = (m['text'] ?? '').toString();
                    final ts = m['timestamp'];
                    final delivery = (m['delivery'] ?? '').toString();
                    final media = m['media'] as Map<String, dynamic>?;

                    return Align(
                      alignment: isOut ? Alignment.centerRight : Alignment.centerLeft,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 320),
                        child: Card(
                          color: isOut ? Colors.green.shade50 : Colors.grey.shade100,
                          child: Padding(
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (media != null && (media['url'] ?? '').toString().isNotEmpty)
                                  _mediaWidget(context, media)
                                else if (text.isNotEmpty)
                                  Text(text),
                                const SizedBox(height: 6),
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      _fmtTs(ts),
                                      style: Theme.of(context).textTheme.bodySmall,
                                    ),
                                    if (isOut) ...[
                                      const SizedBox(width: 6),
                                      _deliveryIcon(delivery),
                                    ],
                                  ],
                                )
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                );
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      decoration: const InputDecoration(
                        hintText: 'Scrie un mesaj...',
                        border: OutlineInputBorder(),
                      ),
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      enabled: !_sending && _canSend,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: (_sending || !_canSend) ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _deliveryIcon(String delivery) {
    // queued|sent|delivered|read|failed
    final icon = deliveryIconData(delivery);
    final color = deliveryIconColor(delivery);
    if (icon == null || color == null) return const SizedBox.shrink();
    return Icon(icon, size: 14, color: color);
    return const SizedBox.shrink();
  }

  Widget _mediaWidget(BuildContext context, Map<String, dynamic> media) {
    final type = (media['type'] ?? '').toString();
    final url = (media['url'] ?? '').toString();
    final fileName = (media['fileName'] ?? '').toString();

    if (type == 'image') {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(url, width: 260, height: 260, fit: BoxFit.cover),
      );
    }

    return InkWell(
      onTap: () async {
        final uri = Uri.tryParse(url);
        if (uri == null) return;
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      },
      child: Row(
        children: [
          const Icon(Icons.attach_file),
          const SizedBox(width: 8),
          Expanded(child: Text(fileName.isEmpty ? 'Attachment' : fileName)),
        ],
      ),
    );
  }

  static String _fmtTs(dynamic ts) {
    DateTime? dt;
    if (ts is Timestamp) dt = ts.toDate();
    if (ts is int) dt = DateTime.fromMillisecondsSinceEpoch(ts);
    if (ts is String) dt = DateTime.tryParse(ts);
    if (dt == null) return '';
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')} $hh:$mm';
  }
}

