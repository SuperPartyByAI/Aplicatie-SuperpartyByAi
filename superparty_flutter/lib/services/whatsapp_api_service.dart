import 'dart:convert';
import 'package:http/http.dart' as http;

import '../core/config/env.dart';

/// Service for interacting with Railway WhatsApp backend directly.
class WhatsAppApiService {
  static final WhatsAppApiService _instance = WhatsAppApiService._internal();
  factory WhatsAppApiService() => _instance;
  WhatsAppApiService._internal();

  static WhatsAppApiService get instance => _instance;

  /// Get Railway backend base URL
  String _getBackendUrl() {
    return Env.whatsappBackendUrl;
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

  /// Get list of WhatsApp accounts from Railway backend.
  /// 
  /// Returns: { success: bool, accounts: List<Account> }
  /// Account: { id, name, phone, status, qrCode?, pairingCode?, ... }
  Future<Map<String, dynamic>> getAccounts() async {
    final backendUrl = _getBackendUrl();

    final response = await http.get(
      Uri.parse('$backendUrl/api/whatsapp/accounts'),
      headers: {
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        'Get accounts failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}',
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data;
  }

  /// Add a new WhatsApp account via Railway backend.
  /// 
  /// NOTE: Backend requires phone (QR-only without phone is not supported).
  /// 
  /// Returns: { success: bool, account: { id, name, phone, status, ... } }
  Future<Map<String, dynamic>> addAccount({
    required String name,
    required String phone,
  }) async {
    final backendUrl = _getBackendUrl();

    final response = await http.post(
      Uri.parse('$backendUrl/api/whatsapp/add-account'),
      headers: {
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

  /// Regenerate QR code for a WhatsApp account via Railway backend.
  /// 
  /// Returns: { success: bool, message?: string, ... }
  Future<Map<String, dynamic>> regenerateQr({
    required String accountId,
  }) async {
    final backendUrl = _getBackendUrl();

    final response = await http.post(
      Uri.parse('$backendUrl/api/whatsapp/regenerate-qr/$accountId'),
      headers: {
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        'Regenerate QR failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}',
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data;
  }

  /// Delete a WhatsApp account via Railway backend.
  /// 
  /// Returns: { success: bool, ... }
  Future<Map<String, dynamic>> deleteAccount({
    required String accountId,
  }) async {
    final backendUrl = _getBackendUrl();

    final response = await http.delete(
      Uri.parse('$backendUrl/api/whatsapp/accounts/$accountId'),
      headers: {
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(
        'Delete account failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}',
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data;
  }

  /// Get QR page URL for an account (fallback: open in browser).
  /// 
  /// Returns: Full URL to Railway QR endpoint (HTML page).
  String qrPageUrl(String accountId) {
    final backendUrl = _getBackendUrl();
    return '$backendUrl/api/whatsapp/qr/$accountId';
  }
}
