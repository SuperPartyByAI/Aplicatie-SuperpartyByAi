import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class SalarizareScreen extends StatelessWidget {
  const SalarizareScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(title: const Text('Salarizare')),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('salarii')
            .where('userId', isEqualTo: user?.uid)
            .orderBy('data', descending: true)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError)
            return Center(child: Text('Eroare: ${snapshot.error}'));
          if (!snapshot.hasData)
            return const Center(child: CircularProgressIndicator());

          final salarii = snapshot.data!.docs;
          if (salarii.isEmpty)
            return const Center(child: Text('Nu există date despre salarii'));

          return ListView.builder(
            itemCount: salarii.length,
            itemBuilder: (context, index) {
              final salariu = salarii[index].data() as Map<String, dynamic>;
              return Card(
                margin: const EdgeInsets.all(8),
                child: ListTile(
                  leading:
                      const Icon(Icons.attach_money, color: Color(0xFFDC2626)),
                  title: Text('${salariu['suma']} RON'),
                  subtitle: Text(salariu['descriere'] ?? ''),
                  trailing: Text(salariu['data']?.toString() ?? ''),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
