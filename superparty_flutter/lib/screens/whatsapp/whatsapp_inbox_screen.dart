import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import 'whatsapp_chat_screen.dart';

class WhatsAppInboxScreen extends StatelessWidget {
  const WhatsAppInboxScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final q = FirebaseFirestore.instance
        .collection('whatsapp_threads')
        .orderBy('lastMessageAt', descending: true)
        .limit(50);

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
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

        return ListView.separated(
          itemCount: docs.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, i) {
            final d = docs[i];
            final data = d.data();
            final title = (data['title'] ?? data['chatId'] ?? d.id).toString();
            final lastText = (data['lastMessageText'] ?? '').toString();
            final unread = _asInt(data['unreadCount']);
            final ts = data['lastMessageAt'];
            final subtitle = lastText.isEmpty ? null : lastText;

            return ListTile(
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

