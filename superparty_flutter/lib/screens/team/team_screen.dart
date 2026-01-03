import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class TeamScreen extends StatelessWidget {
  const TeamScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Echipă')),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance.collection('staffProfiles').snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) return Center(child: Text('Eroare: ${snapshot.error}'));
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

          final staff = snapshot.data!.docs;
          if (staff.isEmpty) return const Center(child: Text('Nu există membri în echipă'));

          return ListView.builder(
            itemCount: staff.length,
            itemBuilder: (context, index) {
              final member = staff[index].data() as Map<String, dynamic>;
              return Card(
                margin: const EdgeInsets.all(8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFFDC2626),
                    child: Text(
                      (member['cineNoteaza'] ?? 'N')[0].toUpperCase(),
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                  title: Text(member['cineNoteaza'] ?? 'N/A'),
                  subtitle: Text('Cod: ${member['code'] ?? 'N/A'}'),
                  trailing: Icon(
                    member['setupDone'] == true ? Icons.check_circle : Icons.pending,
                    color: member['setupDone'] == true ? Colors.green : Colors.orange,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
