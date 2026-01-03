import 'package:flutter/material.dart';

class AiConversationsScreen extends StatelessWidget {
  const AiConversationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Conversații AI'),
        backgroundColor: const Color(0xFFEF4444),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.chat_bubble, size: 80, color: Color(0xFFEF4444)),
            SizedBox(height: 20),
            Text(
              'Conversații AI',
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
