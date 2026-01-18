import 'dart:convert';
import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart' show kDebugMode, debugPrint;
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

  /// Get list of WhatsApp accounts via Functions proxy.
  /// 
  /// CRITICAL FIX: Uses proxy with Authorization header (Firebase ID token).
  /// Previously called Railway directly without auth, causing 401 errors.
  /// 
  /// Returns: { success: bool, accounts: List<Account> }
  /// Account: { id, name, phone, status, qrCode?, pairingCode?, ... }
  Future<Map<String, dynamic>> getAccounts() async {
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      // Get Firebase ID token
      final token = await user.getIdToken();
      final functionsUrl = _getFunctionsUrl();
      final requestId = _generateRequestId();

      debugPrint('[WhatsAppApiService] getAccounts: calling proxy (uid=${user.uid.substring(0, 8)}...)');

      // Call Functions proxy with Authorization header
      final response = await http
          .get(
            Uri.parse('$functionsUrl/whatsappProxyGetAccounts'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          )
          .timeout(requestTimeout);

      debugPrint('[WhatsAppApiService] getAccounts: status=${response.statusCode}, bodyLength=${response.body.length}');

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        debugPrint('[WhatsAppApiService] getAccounts: error=${errorBody?['error']}, message=${errorBody?['message']}');
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      debugPrint('[WhatsAppApiService] getAccounts: success, accountsCount=${(data['accounts'] as List?)?.length ?? 0}');
      return data;
    });
  }

  /// Add a new WhatsApp account via Functions proxy.
  /// 
  /// CRITICAL FIX: Uses proxy with Authorization header (Firebase ID token).
  /// Previously called Railway directly without auth, causing 401 errors.
  /// 
  /// NOTE: Backend requires phone (QR-only without phone is not supported).
  /// 
  /// Returns: { success: bool, account: { id, name, phone, status, ... } }
  Future<Map<String, dynamic>> addAccount({
    required String name,
    required String phone,
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

      debugPrint('[WhatsAppApiService] addAccount: calling proxy (uid=${user.uid.substring(0, 8)}..., name=$name, phone=$phone)');

      // Call Functions proxy with Authorization header
      final response = await http
          .post(
            Uri.parse('$functionsUrl/whatsappProxyAddAccount'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
            body: jsonEncode({
              'name': name,
              'phone': phone,
            }),
          )
          .timeout(requestTimeout);

      debugPrint('[WhatsAppApiService] addAccount: status=${response.statusCode}, bodyLength=${response.body.length}');

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        debugPrint('[WhatsAppApiService] addAccount: error=${errorBody?['error']}, message=${errorBody?['message']}');
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      debugPrint('[WhatsAppApiService] addAccount: success, accountId=${data['accountId'] ?? data['account']?['id']}');
      return data;
    });
  }

  /// Regenerate QR code for a WhatsApp account via Functions proxy.
  /// 
  /// CRITICAL FIX: Uses proxy with Authorization header (Firebase ID token).
  /// Previously called Railway directly without auth, causing 401 errors.
  /// 
  /// Returns: { success: bool, message?: string, ... }
  Future<Map<String, dynamic>> regenerateQr({
    required String accountId,
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

      debugPrint('[WhatsAppApiService] regenerateQr: calling proxy (uid=${user.uid.substring(0, 8)}..., accountId=$accountId)');

      // Call Functions proxy with Authorization header (query param for accountId)
      final response = await http
          .post(
            Uri.parse('$functionsUrl/whatsappProxyRegenerateQr?accountId=$accountId'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          )
          .timeout(requestTimeout);

      debugPrint('[WhatsAppApiService] regenerateQr: status=${response.statusCode}, bodyLength=${response.body.length}');

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        debugPrint('[WhatsAppApiService] regenerateQr: error=${errorBody?['error']}, message=${errorBody?['message']}');
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      debugPrint('[WhatsAppApiService] regenerateQr: success, message=${data['message']}');
      return data;
    });
  }

  /// Delete a WhatsApp account via Functions proxy (super-admin only).
  /// 
  /// Uses secure proxy to enforce super-admin authentication.
  /// Returns: { success: bool, ... }
  Future<Map<String, dynamic>> deleteAccount({
    required String accountId,
  }) async {
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      final token = await user.getIdToken();
      final functionsUrl = _getFunctionsUrl();
      final requestId = _generateRequestId();

      // Call Functions proxy with DELETE or POST
      final response = await http
          .post(
            Uri.parse('$functionsUrl/whatsappProxyDeleteAccount?accountId=$accountId'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
            body: jsonEncode({'accountId': accountId}),
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

  /// Extract event booking from WhatsApp thread messages (AI extraction).
  /// 
  /// Calls Firebase callable: whatsappExtractEventFromThread
  /// Uses europe-west1 region (co-located with Firestore eur3 for low latency)
  /// 
  /// Input: { threadId, accountId, phoneE164?, lastNMessages?, dryRun? }
  /// Output: { action: CREATE_EVENT|UPDATE_EVENT|NOOP, draftEvent, targetEventId?, confidence, reasons }
  Future<Map<String, dynamic>> extractEventFromThread({
    required String threadId,
    required String accountId,
    String? phoneE164,
    int lastNMessages = 50,
    bool dryRun = true,
  }) async {
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      // Use us-central1 region (where functions are deployed)
      final functions = FirebaseFunctions.instanceFor(region: 'us-central1');
      final callable = functions.httpsCallable(
        'whatsappExtractEventFromThread',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 60)),
      );

      final result = await callable.call({
        'threadId': threadId,
        'accountId': accountId,
        if (phoneE164 != null) 'phoneE164': phoneE164,
        'lastNMessages': lastNMessages,
        'dryRun': dryRun,
      });

      final data = result.data as Map<String, dynamic>? ?? {};
      return data;
    });
  }

  /// Get client profile (CRM aggregates).
  /// 
  /// Queries Firestore: clients/{phoneE164}
  /// Returns: { phoneE164, lifetimeSpendPaid, eventsCount, lastEventAt, ... } or null if not found
  Future<Map<String, dynamic>?> getClientProfile(String phoneE164) async {
    try {
      final firestore = FirebaseFirestore.instance;
      final doc = await firestore.collection('clients').doc(phoneE164).get();
      
      if (!doc.exists) {
        return null;
      }

      final data = doc.data();
      if (data == null) return null;

      return {
        'phoneE164': phoneE164,
        ...data,
      };
    } catch (e) {
      throw Exception('Failed to get client profile: $e');
    }
  }

  /// Ask AI about a client (CRM questions).
  /// 
  /// Calls Firebase callable: clientCrmAsk
  /// Input: { phoneE164, question }
  /// Output: { answer, sources: [{eventShortId, date, details}] }
  Future<Map<String, dynamic>> askClientAI({
    required String phoneE164,
    required String question,
  }) async {
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      final functions = FirebaseFunctions.instanceFor(region: 'us-central1');
      final callable = functions.httpsCallable(
        'clientCrmAsk',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
      );

      final result = await callable.call({
        'phoneE164': phoneE164,
        'question': question,
      });

      final data = result.data as Map<String, dynamic>? ?? {};
      return data;
    });
  }
}
