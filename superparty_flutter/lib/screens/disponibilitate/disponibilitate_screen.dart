import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class DisponibilitateScreen extends StatefulWidget {
  const DisponibilitateScreen({super.key});

  @override
  State<DisponibilitateScreen> createState() => _DisponibilitateScreenState();
}

class _DisponibilitateScreenState extends State<DisponibilitateScreen> {
  DateTime _selectedDate = DateTime.now();
  bool _isAvailable = false;

  Future<void> _saveDisponibilitate() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    await FirebaseFirestore.instance.collection('disponibilitate').doc('${user.uid}_${_selectedDate.toIso8601String().split('T')[0]}').set({
      'userId': user.uid,
      'data': _selectedDate,
      'disponibil': _isAvailable,
      'timestamp': FieldValue.serverTimestamp(),
    });

    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Disponibilitate salvată')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Disponibilitate')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            CalendarDatePicker(
              initialDate: _selectedDate,
              firstDate: DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 365)),
              onDateChanged: (date) => setState(() => _selectedDate = date),
            ),
            const SizedBox(height: 24),
            SwitchListTile(
              title: const Text('Sunt disponibil'),
              value: _isAvailable,
              onChanged: (value) => setState(() => _isAvailable = value),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _saveDisponibilitate,
                child: const Text('Salvează'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
