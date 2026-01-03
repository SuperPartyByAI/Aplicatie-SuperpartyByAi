import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen> {
  final List<Map<String, String>> _messages = [
    {'role': 'assistant', 'content': 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?'}
  ];
  final _inputController = TextEditingController();
  bool _loading = false;

  Future<void> _sendMessage() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _loading) return;

    final user = FirebaseAuth.instance.currentUser;
    final isAdmin = user?.email == 'ursache.andrei1995@gmail.com';

    // Secret commands for admin
    if (isAdmin && text.toLowerCase() == 'admin') {
      setState(() {
        _messages.add({'role': 'user', 'content': text});
        _messages.add({'role': 'assistant', 'content': '🔓 Admin mode activat. Deschid meniul admin...'});
      });
      _inputController.clear();
      await Future.delayed(const Duration(milliseconds: 500));
      Navigator.pushNamed(context, '/admin');
      return;
    }

    if (isAdmin && text.toLowerCase() == 'gm') {
      setState(() {
        _messages.add({'role': 'user', 'content': text});
        _messages.add({'role': 'assistant', 'content': '🔓 GM mode activat. Deschid meniul GM...'});
      });
      _inputController.clear();
      return;
    }

    // Normal AI chat
    setState(() {
      _messages.add({'role': 'user', 'content': text});
      _loading = true;
    });
    _inputController.clear();

    try {
      // Call Firebase Function
      final response = await http.post(
        Uri.parse('https://us-central1-superparty-frontend.cloudfunctions.net/chatWithAI'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'messages': _messages}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        setState(() {
          _messages.add({'role': 'assistant', 'content': data['message'] ?? 'No response'});
        });
      }
    } catch (e) {
      setState(() {
        _messages.add({'role': 'assistant', 'content': 'Eroare: ${e.toString()}'});
      });
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('🤖 Chat AI'),
        backgroundColor: const Color(0xFF6366F1),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                final isUser = msg['role'] == 'user';
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isUser ? const Color(0xFF6366F1) : Colors.grey[300],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      msg['content'] ?? '',
                      style: TextStyle(color: isUser ? Colors.white : Colors.black),
                    ),
                  ),
                );
              },
            ),
          ),
          if (_loading) const LinearProgressIndicator(),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    decoration: const InputDecoration(
                      hintText: 'Scrie un mesaj...',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send, color: Color(0xFF6366F1)),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
