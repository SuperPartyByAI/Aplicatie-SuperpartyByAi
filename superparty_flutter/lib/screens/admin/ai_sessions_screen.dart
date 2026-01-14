import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../core/auth/is_super_admin.dart';

import 'ai_session_detail_screen.dart';

class AiSessionsScreen extends StatelessWidget {
  final String? eventId;

  const AiSessionsScreen({
    super.key,
    this.eventId,
  });

  bool get _isSuperAdmin => isSuperAdmin(FirebaseAuth.instance.currentUser);

  @override
  Widget build(BuildContext context) {
    if (!_isSuperAdmin) {
      return const Scaffold(
        body: Center(child: Text('Doar super-admin poate vedea AI sessions.')),
      );
    }

    Query<Map<String, dynamic>> query = FirebaseFirestore.instance
        .collection('ai_sessions')
        .orderBy('startedAt', descending: true)
        .limit(100);
    if (eventId != null && eventId!.isNotEmpty) {
      query = query.where('eventId', isEqualTo: eventId);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(eventId == null ? 'AI Sessions' : 'AI Sessions (${eventId!})'),
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
              final eid = (data['eventId'] ?? '').toString();

              return ListTile(
                title: Text('${d.id} • $status'),
                subtitle: Text('$actorEmail • $actionType • eventId=$eid • $startedAt'),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AiSessionDetailScreen(
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

