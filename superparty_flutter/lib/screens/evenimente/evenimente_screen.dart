import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class EvenimenteScreen extends StatelessWidget {
  const EvenimenteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Evenimente')),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance.collection('evenimente').orderBy('data', descending: true).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) return Center(child: Text('Eroare: ${snapshot.error}'));
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

          final events = snapshot.data!.docs;
          if (events.isEmpty) return const Center(child: Text('Nu există evenimente'));

          return ListView.builder(
            itemCount: events.length,
            itemBuilder: (context, index) {
              final event = events[index].data() as Map<String, dynamic>;
              return Card(
                margin: const EdgeInsets.all(8),
                child: ListTile(
                  leading: const Icon(Icons.event, color: Color(0xFFDC2626)),
                  title: Text(event['nume'] ?? 'Eveniment'),
                  subtitle: Text(event['locatie'] ?? ''),
                  trailing: Text(event['data']?.toString() ?? ''),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
