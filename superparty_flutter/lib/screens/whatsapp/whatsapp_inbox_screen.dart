import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'whatsapp_chat_screen.dart';

class WhatsAppInboxScreen extends StatefulWidget {
  const WhatsAppInboxScreen({super.key});

  @override
  State<WhatsAppInboxScreen> createState() => _WhatsAppInboxScreenState();
}

class _WhatsAppInboxScreenState extends State<WhatsAppInboxScreen> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = FirebaseFirestore.instance
        .collection('whatsapp_threads')
        .orderBy('lastMessageAt', descending: true)
        .limit(50);

    final uid = FirebaseAuth.instance.currentUser?.uid;
    final prefsStream = uid == null
        ? const Stream<QuerySnapshot<Map<String, dynamic>>>.empty()
        : FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('whatsapp_thread_prefs')
            .snapshots();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: TextField(
            controller: _search,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Caută (telefon/nume)...',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
        ),
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: q.snapshots(),
            builder: (context, snap) {
              if (snap.hasError) {
                return Center(child: Text('Eroare: ${snap.error}'));
              }
              if (!snap.hasData) {
                return const Center(child: CircularProgressIndicator());
              }

              final docs = snap.data!.docs;
              if (docs.isEmpty) {
                return const Center(child: Text('Inbox gol.'));
              }

              return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: prefsStream,
                builder: (context, prefsSnap) {
                  final prefs = <String, Map<String, dynamic>>{};
                  for (final d in prefsSnap.data?.docs ?? []) {
                    prefs[d.id] = d.data();
                  }

                  final query = _search.text.trim().toLowerCase();
                  final filtered = docs.where((d) {
                    if (query.isEmpty) return true;
                    final data = d.data();
                    final title = (data['clientDisplayName'] ?? data['clientPhoneE164'] ?? data['chatId'] ?? d.id).toString();
                    return title.toLowerCase().contains(query);
                  }).toList();

                  filtered.sort((a, b) {
                    final ap = prefs[a.id]?['pinned'] == true;
                    final bp = prefs[b.id]?['pinned'] == true;
                    if (ap != bp) return ap ? -1 : 1;
                    return 0;
                  });

                  return ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final d = filtered[i];
                      final data = d.data();
                      final title =
                          (data['clientDisplayName'] ?? data['clientPhoneE164'] ?? data['chatId'] ?? d.id).toString();
                      final lastText = (data['lastMessagePreview'] ?? '').toString();
                      final unread = _asInt(data['unreadCountGlobal']);
                      final ts = data['lastMessageAt'];
                      final subtitle = lastText.isEmpty ? null : lastText;
                      final pinned = prefs[d.id]?['pinned'] == true;

                      return ListTile(
                        leading: pinned ? const Icon(Icons.push_pin, size: 18) : null,
                        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: subtitle == null
                            ? null
                            : Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              _fmtTs(ts),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 6),
                            if (unread > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.green.shade600,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  unread.toString(),
                                  style: const TextStyle(color: Colors.white, fontSize: 12),
                                ),
                              ),
                          ],
                        ),
                        onLongPress: uid == null
                            ? null
                            : () async {
                                final ref = FirebaseFirestore.instance
                                    .collection('users')
                                    .doc(uid)
                                    .collection('whatsapp_thread_prefs')
                                    .doc(d.id);
                                await ref.set({'pinned': !pinned, 'updatedAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
                              },
                        onTap: () {
                          final accountId = (data['accountId'] ?? '').toString();
                          final chatId = (data['chatId'] ?? '').toString();
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => WhatsAppChatScreen(
                                threadId: d.id,
                                accountId: accountId,
                                chatId: chatId,
                                title: title,
                              ),
                            ),
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  static int _asInt(dynamic v) {
    if (v is num) return v.toInt();
    return int.tryParse((v ?? '').toString()) ?? 0;
  }

  static String _fmtTs(dynamic ts) {
    DateTime? dt;
    if (ts is Timestamp) dt = ts.toDate();
    if (ts is int) dt = DateTime.fromMillisecondsSinceEpoch(ts);
    if (ts is String) {
      final parsed = DateTime.tryParse(ts);
      if (parsed != null) dt = parsed;
    }
    if (dt == null) return '';

    final now = DateTime.now();
    final sameDay = now.year == dt.year && now.month == dt.month && now.day == dt.day;
    if (sameDay) {
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      return '$hh:$mm';
    }
    final dd = dt.day.toString().padLeft(2, '0');
    final mo = dt.month.toString().padLeft(2, '0');
    return '$dd.$mo';
  }
}

