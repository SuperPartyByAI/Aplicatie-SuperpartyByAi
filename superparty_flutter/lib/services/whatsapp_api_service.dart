import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

/// Service for interacting with WhatsApp backend via Firebase Functions proxy.
class WhatsAppApiService {
  static final WhatsAppApiService _instance = WhatsAppApiService._internal();
  factory WhatsAppApiService() => _instance;
  WhatsAppApiService._internal();

  static WhatsAppApiService get instance => _instance;

  /// Get Firebase Functions base URL
  String _getFunctionsUrl() {
    final projectId = FirebaseAuth.instance.app.options.projectId;
    return 'https://us-central1-$projectId.cloudfunctions.net';
  }

  /// Send WhatsApp message via Functions proxy.
  /// 
  /// Enforces owner/co-writer policy and creates outbox entry server-side.
  /// 
  /// Returns: { success: bool, requestId: string, duplicate: bool }
  Future<Map<String, dynamic>> sendViaProxy({
    required String threadId,
    required String accountId,
    required String toJid,
    required String text,
    required String clientMessageId,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      throw Exception('Not authenticated');
    }

    // Get Firebase ID token
    final token = await user.getIdToken();
    final functionsUrl = _getFunctionsUrl();

    // Call Functions proxy
    final response = await http.post(
      Uri.parse('$functionsUrl/whatsappProxySend'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'threadId': threadId,
        'accountId': accountId,
        'toJid': toJid,
        'text': text,
        'clientMessageId': clientMessageId,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        'Send failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}',
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data;
  }
}
