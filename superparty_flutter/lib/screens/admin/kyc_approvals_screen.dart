import 'package:flutter/material.dart';

class KycApprovalsScreen extends StatelessWidget {
  const KycApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Aprobări KYC'),
        backgroundColor: const Color(0xFFEF4444),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle, size: 80, color: Color(0xFFEF4444)),
            SizedBox(height: 20),
            Text(
              'Aprobări KYC',
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
