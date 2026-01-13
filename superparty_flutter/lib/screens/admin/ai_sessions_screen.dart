import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'ai_session_detail_screen.dart';

class AiSessionsScreen extends StatelessWidget {
  static const _superAdminEmail = 'ursache.andrei1995@gmail.com';

  final String eventId;

  const AiSessionsScreen({
    super.key,
    required this.eventId,
  });

  bool get _isSuperAdmin =>
      (FirebaseAuth.instance.currentUser?.email ?? '') == _superAdminEmail;

  @override
  Widget build(BuildContext context) {
    if (!_isSuperAdmin) {
      return const Scaffold(
        body: Center(child: Text('Doar super-admin poate vedea AI sessions.')),
      );
    }

    final query = FirebaseFirestore.instance
        .collection('evenimente')
        .doc(eventId)
        .collection('ai_sessions')
        .orderBy('startedAt', descending: true)
        .limit(50);

    return Scaffold(
      appBar: AppBar(
        title: Text('AI Sessions ($eventId)'),
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: query.snapshots(),
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(child: Text('Eroare: ${snap.error}'));
          }
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snap.data!.docs;
          if (docs.isEmpty) {
            return const Center(child: Text('Nu există sesiuni.'));
          }

          return ListView.separated(
            itemCount: docs.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final d = docs[i];
              final data = d.data();
              final status = (data['status'] ?? '').toString();
              final actorEmail = (data['actorEmail'] ?? '').toString();
              final actionType = (data['actionType'] ?? '').toString();
              final startedAt = data['startedAt'];

              return ListTile(
                title: Text('${d.id} • $status'),
                subtitle: Text('$actorEmail • $actionType • $startedAt'),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AiSessionDetailScreen(
                        eventId: eventId,
                        sessionId: d.id,
                      ),
                    ),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}

