import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class AiSessionDetailScreen extends StatelessWidget {
  static const _superAdminEmail = 'ursache.andrei1995@gmail.com';

  final String eventId;
  final String sessionId;

  const AiSessionDetailScreen({
    super.key,
    required this.eventId,
    required this.sessionId,
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

    final sessionRef = FirebaseFirestore.instance
        .collection('evenimente')
        .doc(eventId)
        .collection('ai_sessions')
        .doc(sessionId);

    final messagesQuery =
        sessionRef.collection('messages').orderBy('createdAt').limit(300);
    final stepsQuery = sessionRef.collection('steps').orderBy('createdAt').limit(200);

    return Scaffold(
      appBar: AppBar(
        title: Text('AI Session $sessionId'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
            stream: sessionRef.snapshots(),
            builder: (context, snap) {
              if (!snap.hasData) return const LinearProgressIndicator();
              final data = snap.data!.data() ?? <String, dynamic>{};
              return _jsonCard('Session meta', data);
            },
          ),
          const SizedBox(height: 12),
          StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: stepsQuery.snapshots(),
            builder: (context, snap) {
              if (!snap.hasData) return const LinearProgressIndicator();
              final items = snap.data!.docs.map((d) => d.data()).toList();
              return _jsonCard('Steps (${items.length})', items);
            },
          ),
          const SizedBox(height: 12),
          StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: messagesQuery.snapshots(),
            builder: (context, snap) {
              if (!snap.hasData) return const LinearProgressIndicator();
              final msgs = snap.data!.docs.map((d) => d.data()).toList();
              return _jsonCard('Messages (${msgs.length})', msgs);
            },
          ),
        ],
      ),
    );
  }

  Widget _jsonCard(String title, Object obj) {
    final jsonPretty = const JsonEncoder.withIndent('  ').convert(obj);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            SelectableText(
              jsonPretty,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

