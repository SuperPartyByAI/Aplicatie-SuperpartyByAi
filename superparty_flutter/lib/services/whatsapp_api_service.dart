import 'dart:convert';
import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:http/http.dart' as http;

import '../core/config/env.dart';
import '../core/errors/app_exception.dart';
import '../core/utils/retry.dart';

/// Service for interacting with Railway WhatsApp backend directly.
class WhatsAppApiService {
  static final WhatsAppApiService _instance = WhatsAppApiService._internal();
  factory WhatsAppApiService() => _instance;
  WhatsAppApiService._internal();

  static WhatsAppApiService get instance => _instance;

  /// Request timeout (configurable)
  Duration requestTimeout = const Duration(seconds: 30);

  /// Get Railway backend base URL
  String _getBackendUrl() {
    return Env.whatsappBackendUrl;
  }

  /// Get Functions URL (for proxy calls)
  String _getFunctionsUrl() {
    const region = 'us-central1';
    
    // Check if using emulators
    const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);
    if (useEmulators && kDebugMode) {
      // Emulator Functions URL (from firebase.json: port 5002)
      return 'http://127.0.0.1:5002';
    }
    
    // Production: derive project ID from Firebase
    try {
      final app = Firebase.app();
      final projectId = app.options.projectId;
      if (projectId.isNotEmpty) {
        return 'https://$region-$projectId.cloudfunctions.net';
      }
    } catch (_) {
      // Fallback if Firebase not initialized
    }
    
    // Fallback: use default (should match your Firebase project)
    return 'https://$region-superparty-frontend.cloudfunctions.net';
  }

  /// Generate request ID for idempotency
  String _generateRequestId() {
    return '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(10000)}';
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
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      // Get Firebase ID token
      final token = await user.getIdToken();
      final functionsUrl = _getFunctionsUrl();
      final requestId = _generateRequestId();

      // Call Functions proxy with timeout
      final response = await http
          .post(
            Uri.parse('$functionsUrl/whatsappProxySend'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId, // For idempotency
            },
            body: jsonEncode({
              'threadId': threadId,
              'accountId': accountId,
              'toJid': toJid,
              'text': text,
              'clientMessageId': clientMessageId,
            }),
          )
          .timeout(requestTimeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data;
    });
  }

  /// Get list of WhatsApp accounts from Railway backend.
  /// 
  /// Returns: { success: bool, accounts: List<Account> }
  /// Account: { id, name, phone, status, qrCode?, pairingCode?, ... }
  Future<Map<String, dynamic>> getAccounts() async {
    return retryWithBackoff(() async {
      final backendUrl = _getBackendUrl();
      final requestId = _generateRequestId();

      final response = await http
          .get(
            Uri.parse('$backendUrl/api/whatsapp/accounts'),
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          )
          .timeout(requestTimeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data;
    });
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
    return retryWithBackoff(() async {
      final backendUrl = _getBackendUrl();
      final requestId = _generateRequestId();

      final response = await http
          .post(
            Uri.parse('$backendUrl/api/whatsapp/add-account'),
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
            body: jsonEncode({
              'name': name,
              'phone': phone,
            }),
          )
          .timeout(requestTimeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data;
    });
  }

  /// Regenerate QR code for a WhatsApp account via Railway backend.
  /// 
  /// Returns: { success: bool, message?: string, ... }
  Future<Map<String, dynamic>> regenerateQr({
    required String accountId,
  }) async {
    return retryWithBackoff(() async {
      final backendUrl = _getBackendUrl();
      final requestId = _generateRequestId();

      final response = await http
          .post(
            Uri.parse('$backendUrl/api/whatsapp/regenerate-qr/$accountId'),
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          )
          .timeout(requestTimeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data;
    });
  }

  /// Delete a WhatsApp account via Railway backend.
  /// 
  /// Returns: { success: bool, ... }
  Future<Map<String, dynamic>> deleteAccount({
    required String accountId,
  }) async {
    return retryWithBackoff(() async {
      final backendUrl = _getBackendUrl();
      final requestId = _generateRequestId();

      final response = await http
          .delete(
            Uri.parse('$backendUrl/api/whatsapp/accounts/$accountId'),
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          )
          .timeout(requestTimeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data;
    });
  }

  /// Get QR page URL for an account (fallback: open in browser).
  /// 
  /// Returns: Full URL to Railway QR endpoint (HTML page).
  String qrPageUrl(String accountId) {
    final backendUrl = _getBackendUrl();
    return '$backendUrl/api/whatsapp/qr/$accountId';
  }
}
