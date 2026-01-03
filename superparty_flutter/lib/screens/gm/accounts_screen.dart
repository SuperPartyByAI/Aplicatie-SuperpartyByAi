import 'package:flutter/material.dart';

class AccountsScreen extends StatelessWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Conturi WhatsApp'),
        backgroundColor: const Color(0xFFFBBF24),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.settings, size: 80, color: Color(0xFFFBBF24)),
            SizedBox(height: 20),
            Text(
              'Conturi WhatsApp',
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
