import 'package:flutter/material.dart';

class MetricsScreen extends StatelessWidget {
  const MetricsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Metrice'),
        backgroundColor: const Color(0xFFFBBF24),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.bar_chart, size: 80, color: Color(0xFFFBBF24)),
            SizedBox(height: 20),
            Text(
              'Metrice',
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
