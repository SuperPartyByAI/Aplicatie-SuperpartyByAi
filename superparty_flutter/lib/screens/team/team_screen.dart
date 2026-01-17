import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class TeamScreen extends StatelessWidget {
  const TeamScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Scaffold(
      appBar: AppBar(title: const Text('Echipă')),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance.collection('staffProfiles').snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Text(
                'Eroare: ${snapshot.error}',
                style: TextStyle(color: theme.colorScheme.error),
              ),
            );
          }
          if (!snapshot.hasData) {
            return Center(child: CircularProgressIndicator(color: theme.colorScheme.primary));
          }

          final staff = snapshot.data!.docs;
          if (staff.isEmpty) {
            return Center(
              child: Text(
                'Nu există membri în echipă',
                style: theme.textTheme.bodyLarge,
              ),
            );
          }

          return ListView.builder(
            itemCount: staff.length,
            itemBuilder: (context, index) {
              final member = staff[index].data() as Map<String, dynamic>;
              return Card(
                margin: const EdgeInsets.all(8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.primary,
                    child: Text(
                      (member['cineNoteaza'] ?? 'N')[0].toUpperCase(),
                      style: TextStyle(color: theme.colorScheme.onPrimary),
                    ),
                  ),
                  title: Text(member['cineNoteaza'] ?? 'N/A'),
                  subtitle: Text('Cod: ${member['code'] ?? 'N/A'}'),
                  trailing: Icon(
                    member['setupDone'] == true ? Icons.check_circle : Icons.pending,
                    color: member['setupDone'] == true 
                        ? theme.colorScheme.primary 
                        : theme.colorScheme.primary.withValues(alpha: 0.6),
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
