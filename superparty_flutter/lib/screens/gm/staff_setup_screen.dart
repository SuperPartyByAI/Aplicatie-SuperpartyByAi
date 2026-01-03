import 'package:flutter/material.dart';

class StaffSetupScreen extends StatelessWidget {
  const StaffSetupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Setări Staff'),
        backgroundColor: const Color(0xFFFBBF24),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people_outline, size: 80, color: Color(0xFFFBBF24)),
            SizedBox(height: 20),
            Text(
              'Setări Staff',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 10),
            Text('Funcționalitate în dezvoltare'),
          ],
        ),
      ),
    );
  }
}
