import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class WhatsAppScreen extends StatefulWidget {
  const WhatsAppScreen({super.key});

  @override
  State<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends State<WhatsAppScreen> {
  WebSocketChannel? _channel;
  final List<Map<String, dynamic>> _chats = [];
  final _messageController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _connectWebSocket();
  }

  void _connectWebSocket() {
    try {
      _channel =
          WebSocketChannel.connect(Uri.parse('wss://your-server.com/whatsapp'));
      _channel!.stream.listen((message) {
        setState(() =>
            _chats.add({'message': message, 'timestamp': DateTime.now()}));
      });
    } catch (e) {
      debugPrint('WebSocket error: $e');
    }
  }

  void _sendMessage() {
    if (_messageController.text.trim().isEmpty) return;
    _channel?.sink.add(_messageController.text);
    _messageController.clear();
  }

  @override
  void dispose() {
    _channel?.sink.close();
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('WhatsApp Chat')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: _chats.length,
              itemBuilder: (context, index) {
                final chat = _chats[index];
                return ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.person)),
                  title: Text(chat['message'].toString()),
                  subtitle: Text(chat['timestamp'].toString()),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Scrie mesaj...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send, color: Color(0xFFDC2626)),
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
