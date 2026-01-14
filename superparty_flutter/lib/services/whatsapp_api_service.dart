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

  /// Get list of WhatsApp accounts from Functions proxy.
  /// 
  /// Returns: { success: bool, accounts: List<Account> }
  /// Account: { id, name, phone, status, qrCode?, pairingCode?, ... }
  Future<Map<String, dynamic>> getAccounts() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      throw Exception('Not authenticated');
    }

    final token = await user.getIdToken();
    final functionsUrl = _getFunctionsUrl();

    final response = await http.get(
      Uri.parse('$functionsUrl/whatsappProxyGetAccounts'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 401) {
      throw Exception('Authentication required. Please log in again.');
    } else if (response.statusCode == 403) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        errorBody?['message'] ?? 'Access denied. Insufficient permissions.',
      );
    } else if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        'Get accounts failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}',
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data;
  }

  /// Add a new WhatsApp account via Functions proxy.
  /// 
  /// Requires super-admin authentication.
  /// 
  /// Returns: { success: bool, accountId?: string, ... }
  Future<Map<String, dynamic>> addAccount({
    required String name,
    required String phone,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      throw Exception('Not authenticated');
    }

    final token = await user.getIdToken();
    final functionsUrl = _getFunctionsUrl();

    final response = await http.post(
      Uri.parse('$functionsUrl/whatsappProxyAddAccount'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'name': name,
        'phone': phone,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        'Add account failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}',
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data;
  }

  /// Regenerate QR code for a WhatsApp account via Functions proxy.
  /// 
  /// Requires super-admin authentication.
  /// 
  /// Returns: { success: bool, message?: string, ... }
  Future<Map<String, dynamic>> regenerateQr({
    required String accountId,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      throw Exception('Not authenticated');
    }

    final token = await user.getIdToken();
    final functionsUrl = _getFunctionsUrl();

    final response = await http.post(
      Uri.parse('$functionsUrl/whatsappProxyRegenerateQr?accountId=$accountId'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 401) {
      throw Exception('Authentication required. Please log in again.');
    } else if (response.statusCode == 403) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        errorBody?['message'] ?? 'Access denied. Super-admin only.',
      );
    } else if (response.statusCode == 400) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        errorBody?['message'] ?? 'Invalid accountId.',
      );
    } else if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        'Regenerate QR failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}',
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data;
  }
}
