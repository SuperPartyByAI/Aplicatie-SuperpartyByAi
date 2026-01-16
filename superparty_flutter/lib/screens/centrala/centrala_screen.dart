import 'dart:async';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class CentralaScreen extends StatefulWidget {
  const CentralaScreen({super.key});

  @override
  State<CentralaScreen> createState() => _CentralaScreenState();
}

class _CentralaScreenState extends State<CentralaScreen> {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  final List<String> _calls = [];

  @override
  void initState() {
    super.initState();
    _connectWebSocket();
  }

  void _connectWebSocket() {
    try {
      _channel = WebSocketChannel.connect(Uri.parse('wss://your-server.com/centrala'));
      _subscription = _channel!.stream.listen(
        (message) {
          // Safe: check mounted before setState
          if (!mounted) return;
          setState(() => _calls.add(message.toString()));
        },
        onError: (error) {
          debugPrint('WebSocket stream error: $error');
        },
        onDone: () {
          debugPrint('WebSocket stream closed');
        },
      );
    } catch (e) {
      debugPrint('WebSocket error: $e');
    }
  }

  @override
  void dispose() {
    // Cancel subscription first to prevent setState after dispose
    _subscription?.cancel();
    _subscription = null;
    // Then close channel sink
    _channel?.sink.close();
    _channel = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Centrala Telefonică')),
      body: ListView.builder(
        itemCount: _calls.length,
        itemBuilder: (context, index) {
          return ListTile(
            leading: const Icon(Icons.phone, color: Color(0xFFDC2626)),
            title: Text(_calls[index]),
            trailing: IconButton(
              icon: const Icon(Icons.call),
              onPressed: () {},
            ),
          );
        },
      ),
    );
  }
}
