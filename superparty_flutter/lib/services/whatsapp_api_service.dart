import 'dart:convert';
import 'dart:io';
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
      // CRITICAL FIX: Use 10.0.2.2 for Android emulator when USE_ADB_REVERSE=false
      // This matches Firebase emulator host selection logic in firebase_service.dart
      const useAdbReverse = bool.fromEnvironment('USE_ADB_REVERSE', defaultValue: true);
      if (Platform.isAndroid && !useAdbReverse) {
        // Android emulator: use 10.0.2.2 (maps to host's 127.0.0.1)
        // Works without adb reverse setup
        debugPrint('[WhatsAppApiService] Using Android emulator Functions URL: http://10.0.2.2:5002 (no adb reverse)');
        return 'http://10.0.2.2:5002';
      } else {
        // Use 127.0.0.1 when adb reverse is configured OR non-Android platform
        debugPrint('[WhatsAppApiService] Using Functions URL: http://127.0.0.1:5002 (adb reverse: $useAdbReverse, platform: ${Platform.isAndroid ? "Android" : "Other"})');
        return 'http://127.0.0.1:5002';
      }
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

      final endpointUrl = '$functionsUrl/whatsappProxySend';
      final hasToken = (token?.isNotEmpty ?? false);
      
      debugPrint('[WhatsAppApiService] sendViaProxy: calling proxy');
      debugPrint('  endpoint: $endpointUrl');
      debugPrint('  uid: ${user.uid.substring(0, 8)}...');
      debugPrint('  tokenPresent: $hasToken');
      debugPrint('  requestId: $requestId');
      debugPrint('  threadId: $threadId, accountId: $accountId, toJid: $toJid');
      debugPrint('  textLength: ${text.length}');

      // Call Functions proxy with timeout
      final response = await http
          .post(
            Uri.parse(endpointUrl),
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

      debugPrint('[WhatsAppApiService] sendViaProxy: response');
      debugPrint('  statusCode: ${response.statusCode}');
      debugPrint('  bodyLength: ${response.body.length}');

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        debugPrint('[WhatsAppApiService] sendViaProxy: error=${errorBody?['error']}, message=${errorBody?['message']}');
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      debugPrint('[WhatsAppApiService] sendViaProxy: success (requestId=${data['requestId']}, duplicate=${data['duplicate']})');
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

      final endpointUrl = '$functionsUrl/whatsappProxyGetAccounts';
      final hasToken = (token?.isNotEmpty ?? false);
      
      debugPrint('[WhatsAppApiService] getAccounts: calling proxy');
      debugPrint('  endpoint: $endpointUrl');
      debugPrint('  uid: ${user.uid.substring(0, 8)}...');
      debugPrint('  tokenPresent: $hasToken');
      debugPrint('  requestId: $requestId');

      // Call Functions proxy with Authorization header
      // #region agent log
      final correlationId = 'getAccounts_${DateTime.now().millisecondsSinceEpoch}';
      // #endregion
      final response = await http
          .get(
            Uri.parse(endpointUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
              'X-Correlation-Id': correlationId, // For end-to-end tracing
            },
          )
          .timeout(requestTimeout);

      debugPrint('[WhatsAppApiService] getAccounts: response');
      debugPrint('  statusCode: ${response.statusCode}');
      debugPrint('  bodyLength: ${response.body.length}');

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        debugPrint('[WhatsAppApiService] getAccounts: error=${errorBody?['error']}, message=${errorBody?['message']}, mode=${errorBody?['mode']}, instanceId=${errorBody?['instanceId']}');
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
          responseBody: errorBody,
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

      final endpointUrl = '$functionsUrl/whatsappProxyAddAccount';
      final hasToken = (token?.isNotEmpty ?? false);
      
      debugPrint('[WhatsAppApiService] addAccount: calling proxy');
      debugPrint('  endpoint: $endpointUrl');
      debugPrint('  uid: ${user.uid.substring(0, 8)}...');
      debugPrint('  tokenPresent: $hasToken');
      debugPrint('  requestId: $requestId');
      debugPrint('  name: $name, phone: $phone');

      // Call Functions proxy with Authorization header
      // #region agent log
      final correlationId = 'addAccount_${DateTime.now().millisecondsSinceEpoch}';
      // #endregion
      final response = await http
          .post(
            Uri.parse(endpointUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
              'X-Correlation-Id': correlationId, // For end-to-end tracing
            },
            body: jsonEncode({
              'name': name,
              'phone': phone,
            }),
          )
          .timeout(requestTimeout);

      debugPrint('[WhatsAppApiService] addAccount: response');
      debugPrint('  statusCode: ${response.statusCode}');
      debugPrint('  bodyLength: ${response.body.length}');

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
        debugPrint('[WhatsAppApiService] addAccount: error=${errorBody?['error']}, message=${errorBody?['message']}, mode=${errorBody?['mode']}, instanceId=${errorBody?['instanceId']}');
        throw ErrorMapper.fromHttpException(
          response.statusCode,
          errorBody?['message'] as String?,
          responseBody: errorBody,
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      debugPrint('[WhatsAppApiService] addAccount: success, accountId=${data['accountId'] ?? data['account']?['id']}');
      return data;
    });
  }

  // In-flight guard for regenerate QR (prevents concurrent calls)
  static final Set<String> _regenerateInFlight = {};
  
  // Cooldown map: accountId -> last failure timestamp
  static final Map<String, DateTime> _regenerateCooldown = {};
  static const _regenerateCooldownSeconds = 30; // 30s cooldown after failure

  /// Regenerate QR code for a WhatsApp account via Functions proxy.
  /// 
  /// CRITICAL FIX: Uses proxy with Authorization header (Firebase ID token).
  /// Previously called Railway directly without auth, causing 401 errors.
  /// 
  /// GUARD: Prevents concurrent calls and enforces cooldown after failures.
  /// BLOCKS: If account status is connecting/qr_ready/connected (no regenerate needed).
  /// 
  /// Returns: { success: bool, message?: string, ... }
  Future<Map<String, dynamic>> regenerateQr({
    required String accountId,
    String? currentStatus, // Optional: check status before regenerating
  }) async {
    // GUARD: Check if already in flight
    if (_regenerateInFlight.contains(accountId)) {
      debugPrint('[WhatsAppApiService] regenerateQr: already in flight for $accountId, skipping');
      throw Exception('QR regeneration already in progress for this account');
    }

    // CRITICAL FIX: Block regenerate if status is connecting/qr_ready/connected
    // These states mean account is already pairing/paired, regenerate is not needed
    if (currentStatus != null) {
      final blockingStatuses = ['connecting', 'qr_ready', 'awaiting_scan', 'connected'];
      if (blockingStatuses.contains(currentStatus)) {
        debugPrint('[WhatsAppApiService] regenerateQr: blocked - account status is $currentStatus (regenerate not needed)');
        throw Exception('Cannot regenerate QR: account status is $currentStatus. QR already available or account is connected.');
      }
    }

    // GUARD: Check cooldown after failure
    final lastFailure = _regenerateCooldown[accountId];
    if (lastFailure != null) {
      final secondsSinceFailure = DateTime.now().difference(lastFailure).inSeconds;
      if (secondsSinceFailure < _regenerateCooldownSeconds) {
        final remaining = _regenerateCooldownSeconds - secondsSinceFailure;
        debugPrint('[WhatsAppApiService] regenerateQr: cooldown active (${remaining}s remaining)');
        throw Exception('Please wait ${remaining}s before regenerating QR again (cooldown after failure)');
      }
      // Cooldown expired, clear it
      _regenerateCooldown.remove(accountId);
    }

    // Mark as in-flight
    _regenerateInFlight.add(accountId);

    try {
      return await retryWithBackoff(() async {
        final user = FirebaseAuth.instance.currentUser;
        if (user == null) {
          throw UnauthorizedException();
        }

        // Get Firebase ID token
        final token = await user.getIdToken();
        final functionsUrl = _getFunctionsUrl();
        final requestId = _generateRequestId();

        final endpointUrl = '$functionsUrl/whatsappProxyRegenerateQr?accountId=$accountId';
        final hasToken = (token?.isNotEmpty ?? false);
        
        debugPrint('[WhatsAppApiService] regenerateQr: calling proxy');
        debugPrint('  endpoint: $endpointUrl');
        debugPrint('  uid: ${user.uid.substring(0, 8)}...');
        debugPrint('  tokenPresent: $hasToken');
        debugPrint('  requestId: $requestId');
        debugPrint('  accountId: $accountId');

        // Call Functions proxy with Authorization header (query param for accountId)
        // #region agent log
        final correlationId = 'regenerateQr_${DateTime.now().millisecondsSinceEpoch}';
        // #endregion
        final response = await http
            .post(
              Uri.parse(endpointUrl),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'X-Request-ID': requestId,
                'X-Correlation-Id': correlationId, // For end-to-end tracing
              },
            )
            .timeout(requestTimeout);

        debugPrint('[WhatsAppApiService] regenerateQr: response');
        debugPrint('  statusCode: ${response.statusCode}');
        debugPrint('  bodyLength: ${response.body.length}');

        // CRITICAL FIX: Handle 202 (already in progress) and 429 (rate limited) as non-fatal
        // 202 = already connecting/regenerating - return success with status
        // 429 = rate limited - return error but don't set cooldown (throttle already applied)
        if (response.statusCode == 202) {
          final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
          debugPrint('[WhatsAppApiService] regenerateQr: 202 already_in_progress - returning success');
          return {
            'success': true,
            'message': errorBody?['message'] ?? 'QR regeneration already in progress',
            'status': errorBody?['status'] ?? 'already_in_progress',
            'requestId': errorBody?['requestId'],
          };
        }
        
        if (response.statusCode < 200 || response.statusCode >= 300) {
          final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
          final errorCode = errorBody?['error'] as String?;
          final status = errorBody?['status'] as String?;
          debugPrint('[WhatsAppApiService] regenerateQr: error=$errorCode, status=$status, message=${errorBody?['message']}, mode=${errorBody?['mode']}, instanceId=${errorBody?['instanceId']}, requestId=${errorBody?['requestId']}');
          
          // CRITICAL FIX: Handle 429 (rate_limited) gracefully - show message but don't set cooldown (throttle already applied)
          if (response.statusCode == 429 || errorCode == 'rate_limited') {
            final retryAfterSeconds = errorBody?['retryAfterSeconds'] as int? ?? 10;
            debugPrint('[WhatsAppApiService] regenerateQr: 429 rate_limited - throttle applied, retryAfter=${retryAfterSeconds}s');
            throw ServiceUnavailableException(
              errorBody?['message'] ?? 'Please wait before regenerating QR again',
              retryAfterSeconds: retryAfterSeconds,
              originalError: errorBody,
            );
          }
          
          // Set cooldown on failure (except for 202/429 which are handled above)
          if (status != 'already_in_progress') {
            _regenerateCooldown[accountId] = DateTime.now();
            debugPrint('[WhatsAppApiService] regenerateQr: cooldown set for $accountId (30s)');
          }
          
          throw ErrorMapper.fromHttpException(
            response.statusCode,
            errorBody?['message'] as String?,
            responseBody: errorBody,
          );
        }

        final data = jsonDecode(response.body) as Map<String, dynamic>;
        debugPrint('[WhatsAppApiService] regenerateQr: success, message=${data['message']}, requestId=${data['requestId']}');
        
        // Clear cooldown on success
        _regenerateCooldown.remove(accountId);
        
        return data;
      });
    } finally {
      // Always remove from in-flight set
      _regenerateInFlight.remove(accountId);
    }
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
