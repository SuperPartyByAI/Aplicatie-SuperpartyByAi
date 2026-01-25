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
import '../core/utils/safe_json.dart';

/// Service for interacting with WhatsApp backend directly.
class WhatsAppApiService {
  static final WhatsAppApiService _instance = WhatsAppApiService._internal();
  factory WhatsAppApiService() => _instance;
  WhatsAppApiService._internal();

  static WhatsAppApiService get instance => _instance;

  /// Request timeout (configurable)
  Duration requestTimeout = const Duration(seconds: 30);

  /// Get backend base URL
  String _getBackendUrl() {
    return Env.whatsappBackendUrl;
  }

  String _maskId(String value) => value.hashCode.toRadixString(16);

  /// True if response is clearly non-JSON (HTML, etc.): body starts with "<" OR
  /// content-type does NOT contain "application/json". Use to avoid parsing.
  bool _isNonJsonResponse(http.Response response) {
    final contentType = response.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().contains('application/json')) return true;
    final trimmed = response.body.trimLeft();
    return trimmed.startsWith('<');
  }

  /// Throw NetworkException when backend returns HTML/non-JSON instead of JSON.
  /// Call this before any jsonDecode so we never crash with FormatException.
  Never _throwNonJsonNetworkException(http.Response response, String endpointUrl) {
    final contentType = response.headers['content-type'] ?? '';
    final status = response.statusCode;
    final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
    final curlHint = " Test with: curl -i $endpointUrl -H 'Authorization: Bearer <token>'";
    throw NetworkException(
      'Expected JSON, got HTML. endpoint=$endpointUrl, status=$status, content-type=$contentType, bodyPrefix=$bodyPrefix.$curlHint',
      code: 'expected_json_got_html',
    );
  }

  String _requireBackendUrl() {
    final backendUrl = _getBackendUrl();
    if (backendUrl.isEmpty) {
      throw DomainFailure(
        'WHATSAPP_BACKEND_URL is not configured. '
        'Set --dart-define=WHATSAPP_BACKEND_URL=https://<backend-host>.',
        code: 'backend_url_missing',
      );
    }
    return backendUrl;
  }

  static bool _loggedFunctionsUrl = false;

  /// True when running against Firebase emulators (Functions at 127.0.0.1:5002).
  /// When true, getAccounts/getThreads MUST use Functions URL with {projectId}/{region}
  /// (e.g. http://127.0.0.1:5002/superparty-frontend/us-central1/whatsappProxyGetAccounts),
  /// never backendUrl — the emulator serves Functions, not /api/whatsapp/... directly.
  bool _isEmulatorMode() {
    const useFirebaseEmulator = bool.fromEnvironment('USE_FIREBASE_EMULATOR', defaultValue: false);
    const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);
    return (useFirebaseEmulator || useEmulators) && kDebugMode;
  }

  /// Get Functions URL (for proxy calls).
  /// Emulator: USE_EMULATORS / USE_FIREBASE_EMULATOR → http://127.0.0.1:5002/{projectId}/{region}.
  /// Prod: https://{region}-{projectId}.cloudfunctions.net.
  /// NO silent fallback. Throws DomainFailure if projectId missing or Firebase not initialized.
  String _getFunctionsUrl() {
    const region = 'us-central1';

    try {
      final app = Firebase.app();
      final projectId = app.options.projectId;
      if (projectId.isEmpty) {
        throw DomainFailure(
          'Firebase projectId is empty. Cannot build Functions URL. '
          'Ensure Firebase is initialized and google-services config has project_id.',
          code: 'functions_url_config',
        );
      }

      const useFirebaseEmulator = bool.fromEnvironment('USE_FIREBASE_EMULATOR', defaultValue: false);
      const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);
      final String url;
      if ((useFirebaseEmulator || useEmulators) && kDebugMode) {
        url = 'http://127.0.0.1:5002/$projectId/$region';
        if (!_loggedFunctionsUrl) {
          debugPrint('[WhatsAppApiService] Functions URL: $url (emulator, projectId=$projectId, USE_EMULATORS=$useEmulators, USE_FIREBASE_EMULATOR=$useFirebaseEmulator)');
          _loggedFunctionsUrl = true;
        }
      } else {
        url = 'https://$region-$projectId.cloudfunctions.net';
        if (!_loggedFunctionsUrl) {
          debugPrint('[WhatsAppApiService] Functions URL: $url (prod, projectId=$projectId)');
          _loggedFunctionsUrl = true;
        }
      }
      return url;
    } catch (e) {
      if (e is DomainFailure) rethrow;
      throw DomainFailure(
        'Firebase not initialized or projectId missing. Cannot build Functions URL. '
        'Fix Firebase init before calling WhatsApp proxy.',
        code: 'functions_url_config',
        originalError: e,
      );
    }
  }

  /// Generate request ID for idempotency
  String _generateRequestId() {
    return '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(10000)}';
  }

  /// Send WhatsApp message via Functions proxy (whatsappProxySend).
  /// Proxy creates outbox entry server-side (Firestore rules are server-only).
  /// Returns: { success: bool, requestId: string, duplicate?: bool }
  Future<Map<String, dynamic>> sendViaProxy({
    required String threadId,
    required String accountId,
    required String toJid,
    required String text,
    required String clientMessageId,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw UnauthorizedException();

    final token = await user.getIdToken();
    final functionsUrl = _getFunctionsUrl();
    final requestId = _generateRequestId();
    final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;
    final endpointUrl = '$functionsUrl/whatsappProxySend';

    debugPrint('[WhatsAppApiService] sendViaProxy: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId');

    final response = await http
        .post(
          Uri.parse(endpointUrl),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Request-ID': requestId,
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

    final contentType = response.headers['content-type'] ?? 'unknown';
    final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
    debugPrint('[WhatsAppApiService] sendViaProxy: AFTER response | statusCode=${response.statusCode} | content-type=$contentType | bodyLength=${response.body.length} | bodyPrefix=$bodyPrefix | requestId=$requestId');

    if (_isNonJsonResponse(response)) {
      _throwNonJsonNetworkException(response, endpointUrl);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      Map<String, dynamic>? errorBody;
      try {
        errorBody = SafeJson.tryDecodeJsonMap(response.body);
      } catch (_) {
        errorBody = null;
      }
      final message = errorBody?['message'] as String? ?? 'HTTP ${response.statusCode}';
      throw ErrorMapper.fromHttpException(response.statusCode, message);
    }

    final data = SafeJson.tryDecodeJsonMap(response.body);
    if (data == null) {
      throw NetworkException(
        'Invalid response: failed to decode JSON. endpoint=$endpointUrl',
        code: 'json_decode_failed',
      );
    }
    return data;
  }

  /// Get list of WhatsApp accounts.
  ///
  /// When [backendUrl] is set (Hetzner): GET $backendUrl/api/whatsapp/accounts.
  /// Otherwise: Functions proxy GET $functionsUrl/whatsappProxyGetAccounts.
  /// Both use Authorization: Bearer (Firebase ID token) and safe JSON parsing.
  ///
  /// Returns: { success: bool, accounts: List<Account> }
  /// Account: { id, name, phone, status, qrCode?, pairingCode?, ... }
  Future<Map<String, dynamic>> getAccounts() async {
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      final token = await user.getIdToken();
      final requestId = _generateRequestId();
      final backendUrl = _getBackendUrl();
      final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;

      // When USE_EMULATORS=true, always use Functions URL (projectId/region prefix).
      // Backend URL hits /api/whatsapp/accounts; emulator serves /{projectId}/{region}/whatsappProxyGetAccounts.
      // Using backendUrl for emulator host → 404 HTML, jsonDecode fails.
      final useProxy = backendUrl.isEmpty || _isEmulatorMode();
      final String endpointUrl;
      final http.Response response;
      if (useProxy) {
        final functionsUrl = _getFunctionsUrl();
        endpointUrl = '$functionsUrl/whatsappProxyGetAccounts';
        debugPrint('[WhatsAppApiService] getAccounts: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId');
        response = await http
            .get(
              Uri.parse(endpointUrl),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Request-ID': requestId,
              },
            )
            .timeout(requestTimeout);
      } else {
        endpointUrl = '$backendUrl/api/whatsapp/accounts';
        debugPrint('[WhatsAppApiService] getAccounts: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId');
        response = await http
            .get(
              Uri.parse(endpointUrl),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Request-ID': requestId,
              },
            )
            .timeout(requestTimeout);
      }

      final contentType = response.headers['content-type'] ?? 'unknown';
      final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
      debugPrint('[WhatsAppApiService] getAccounts: AFTER response | statusCode=${response.statusCode} | content-type=$contentType | bodyLength=${response.body.length} | bodyPrefix=$bodyPrefix | requestId=$requestId');

      if (_isNonJsonResponse(response)) {
        _throwNonJsonNetworkException(response, endpointUrl);
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        String message;
        if (errorBody != null) {
          message = errorBody['message'] as String? ?? 'HTTP ${response.statusCode}';
          debugPrint('[WhatsAppApiService] getAccounts: error=${errorBody['error']}, message=$message');
        } else {
          message = 'HTTP ${response.statusCode} (non-JSON response). content-type=$contentType. bodyPreview=$bodyPrefix';
          debugPrint('[WhatsAppApiService] getAccounts: non-JSON error response, bodyPrefix=$bodyPrefix');
        }
        throw ErrorMapper.fromHttpException(response.statusCode, message);
      }

      Map<String, dynamic>? data;
      try {
        data = SafeJson.tryDecodeJsonMap(response.body);
      } catch (e) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
          originalError: e,
        );
      }
      if (data == null) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
        );
      }
      debugPrint('[WhatsAppApiService] getAccounts: success, accountsCount=${(data['accounts'] as List?)?.length ?? 0}');
      return data;
    });
  }

  /// Add a new WhatsApp account via Functions proxy.
  /// 
  /// CRITICAL FIX: Uses proxy with Authorization header (Firebase ID token).
  /// Previously called backend directly without auth, causing 401 errors.
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

      final token = await user.getIdToken();
      final functionsUrl = _getFunctionsUrl();
      final requestId = _generateRequestId();
      final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;
      final endpointUrl = '$functionsUrl/whatsappProxyAddAccount';

      debugPrint('[WhatsAppApiService] addAccount: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId | name=$name phone=$phone');

      final response = await http
          .post(
            Uri.parse(endpointUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Request-ID': requestId,
            },
            body: jsonEncode({
              'name': name,
              'phone': phone,
            }),
          )
          .timeout(requestTimeout);

      final contentType = response.headers['content-type'] ?? 'unknown';
      final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
      debugPrint('[WhatsAppApiService] addAccount: AFTER response | statusCode=${response.statusCode} | content-type=$contentType | bodyLength=${response.body.length} | bodyPrefix=$bodyPrefix | requestId=$requestId');

      if (_isNonJsonResponse(response)) {
        _throwNonJsonNetworkException(response, endpointUrl);
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        String message;
        if (errorBody != null) {
          message = errorBody['message'] as String? ?? 'HTTP ${response.statusCode}';
          debugPrint('[WhatsAppApiService] addAccount: error=${errorBody['error']}, message=$message');
        } else {
          message = 'HTTP ${response.statusCode} (non-JSON response). content-type=$contentType. bodyPrefix=$bodyPrefix';
          debugPrint('[WhatsAppApiService] addAccount: non-JSON error response, bodyPrefix=$bodyPrefix');
        }
        throw ErrorMapper.fromHttpException(response.statusCode, message);
      }

      Map<String, dynamic>? data;
      try {
        data = SafeJson.tryDecodeJsonMap(response.body);
      } catch (e) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
          originalError: e,
        );
      }
      if (data == null) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
        );
      }
      debugPrint('[WhatsAppApiService] addAccount: success, accountId=${data['accountId'] ?? data['account']?['id']}');
      return data;
    });
  }

  /// Regenerate QR code for a WhatsApp account via Functions proxy.
  /// 
  /// CRITICAL FIX: Uses proxy with Authorization header (Firebase ID token).
  /// Previously called backend directly without auth, causing 401 errors.
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

      final token = await user.getIdToken();
      final functionsUrl = _getFunctionsUrl();
      final requestId = _generateRequestId();
      final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;
      final endpointUrl = '$functionsUrl/whatsappProxyRegenerateQr?accountId=$accountId';

      debugPrint('[WhatsAppApiService] regenerateQr: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId | accountId=${_maskId(accountId)}');

      final response = await http
          .post(
            Uri.parse(endpointUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Request-ID': requestId,
            },
          )
          .timeout(requestTimeout);

      final contentType = response.headers['content-type'] ?? 'unknown';
      final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
      debugPrint('[WhatsAppApiService] regenerateQr: AFTER response | statusCode=${response.statusCode} | content-type=$contentType | bodyLength=${response.body.length} | bodyPrefix=$bodyPrefix | requestId=$requestId');

      if (_isNonJsonResponse(response)) {
        _throwNonJsonNetworkException(response, endpointUrl);
      }

      if (response.statusCode == 202) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        debugPrint('[WhatsAppApiService] regenerateQr: 202 already_in_progress - returning success');
        return {
          'success': true,
          'message': errorBody?['message'] ?? 'QR regeneration already in progress',
          'status': errorBody?['status'] ?? 'already_in_progress',
          'requestId': errorBody?['requestId'],
        };
      }

      if (response.statusCode == 429) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        final retryAfterSeconds = errorBody?['retryAfterSeconds'] as int? ?? 10;
        debugPrint('[WhatsAppApiService] regenerateQr: 429 rate_limited - throttle applied, retryAfter=${retryAfterSeconds}s');
        throw NetworkException(
          errorBody?['message'] ?? 'Please wait ${retryAfterSeconds}s before regenerating QR again',
          code: 'rate_limited',
          originalError: {'retryAfterSeconds': retryAfterSeconds, ...?errorBody},
        );
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        String message;
        if (errorBody != null) {
          message = errorBody['message'] as String? ?? 'HTTP ${response.statusCode}';
          debugPrint('[WhatsAppApiService] regenerateQr: error=${errorBody['error']}, message=$message');
        } else {
          message = 'HTTP ${response.statusCode} (non-JSON response). content-type=$contentType. bodyPrefix=$bodyPrefix';
          debugPrint('[WhatsAppApiService] regenerateQr: non-JSON error response, bodyPrefix=$bodyPrefix');
        }
        throw ErrorMapper.fromHttpException(response.statusCode, message);
      }

      Map<String, dynamic>? data;
      try {
        data = SafeJson.tryDecodeJsonMap(response.body);
      } catch (e) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
          originalError: e,
        );
      }
      if (data == null) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
        );
      }
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
      final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;
      final endpointUrl = '$functionsUrl/whatsappProxyDeleteAccount?accountId=$accountId';

      debugPrint('[WhatsAppApiService] deleteAccount: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId | accountId=${_maskId(accountId)}');

      final response = await http
          .post(
            Uri.parse(endpointUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Request-ID': requestId,
            },
            body: jsonEncode({'accountId': accountId}),
          )
          .timeout(requestTimeout);

      final contentType = response.headers['content-type'] ?? 'unknown';
      final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
      debugPrint('[WhatsAppApiService] deleteAccount: AFTER response | statusCode=${response.statusCode} | content-type=$contentType | bodyLength=${response.body.length} | bodyPrefix=$bodyPrefix | requestId=$requestId');

      if (_isNonJsonResponse(response)) {
        _throwNonJsonNetworkException(response, endpointUrl);
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        String message;
        if (errorBody != null) {
          message = errorBody['message'] as String? ?? 'HTTP ${response.statusCode}';
        } else {
          message = 'HTTP ${response.statusCode} (non-JSON response). content-type=$contentType. bodyPrefix=$bodyPrefix';
          debugPrint('[WhatsAppApiService] deleteAccount: non-JSON error response, bodyPrefix=$bodyPrefix');
        }
        throw ErrorMapper.fromHttpException(response.statusCode, message);
      }

      Map<String, dynamic>? data;
      try {
        data = SafeJson.tryDecodeJsonMap(response.body);
      } catch (e) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
          originalError: e,
        );
      }
      if (data == null) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
        );
      }
      return data;
    });
  }

  /// Get QR page URL for an account (fallback: open in browser).
  /// 
  /// Returns: Full URL to QR endpoint (HTML page).
  String qrPageUrl(String accountId) {
    final backendUrl = _requireBackendUrl();
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

  /// Get threads for an account via Functions proxy.
  /// 
  /// Returns: { success: bool, threads: List<Thread>, count: int }
  /// Thread: { id, clientJid, displayName, lastMessageBody, lastMessageAt, ... }
  Future<Map<String, dynamic>> getThreads({
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

      final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;
      final backendUrl = _getBackendUrl();
      // When USE_EMULATORS=true, always use Functions URL (projectId/region prefix).
      final useProxy = backendUrl.isEmpty || _isEmulatorMode();
      final String endpointUrl;
      final http.Response response;
      if (useProxy) {
        endpointUrl = '$functionsUrl/whatsappProxyGetThreads?accountId=$accountId&limit=500';
        debugPrint('[WhatsAppApiService] getThreads: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId');
        response = await http
            .get(
              Uri.parse(endpointUrl),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Request-ID': requestId,
              },
            )
            .timeout(requestTimeout);
      } else {
        endpointUrl = '$backendUrl/api/whatsapp/threads/$accountId?limit=500&orderBy=lastMessageAt';
        debugPrint('[WhatsAppApiService] getThreads: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId');
        response = await http
            .get(
              Uri.parse(endpointUrl),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Request-ID': requestId,
              },
            )
            .timeout(requestTimeout);
      }

      final contentType = response.headers['content-type'] ?? 'unknown';
      final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
      debugPrint('[WhatsAppApiService] getThreads: AFTER response | statusCode=${response.statusCode} | content-type=$contentType | bodyLength=${response.body.length} | bodyPrefix=$bodyPrefix | requestId=$requestId');

      if (_isNonJsonResponse(response)) {
        _throwNonJsonNetworkException(response, endpointUrl);
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        String message;
        if (errorBody != null) {
          message = errorBody['message'] as String? ?? 'HTTP ${response.statusCode}';
          debugPrint('[WhatsAppApiService] getThreads: error=${errorBody['error']}, message=$message');
        } else {
          message = 'HTTP ${response.statusCode} (non-JSON response). content-type=$contentType. bodyPrefix=$bodyPrefix';
          debugPrint('[WhatsAppApiService] getThreads: non-JSON error response, bodyPrefix=$bodyPrefix');
        }
        throw ErrorMapper.fromHttpException(response.statusCode, message);
      }

      Map<String, dynamic>? data;
      try {
        data = SafeJson.tryDecodeJsonMap(response.body);
      } catch (e) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
          originalError: e,
        );
      }
      if (data == null) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
        );
      }
      debugPrint('[WhatsAppApiService] getThreads: success, threadsCount=${data['threads']?.length ?? 0}');
      return data;
    });
  }

  /// Get unified inbox (all messages from all threads) via API.
  /// 
  /// Returns: { success: bool, messages: List<Message>, count: int, totalMessages: int }
  Future<Map<String, dynamic>> getInbox({
    required String accountId,
    int limit = 100,
  }) async {
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      final token = await user.getIdToken();
      final backendUrl = _requireBackendUrl();
      final requestId = _generateRequestId();
      final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;
      final endpointUrl = '$backendUrl/api/whatsapp/inbox/$accountId?limit=$limit';

      debugPrint('[WhatsAppApiService] getInbox: BEFORE request | endpointUrl=$endpointUrl | uid=$uidTruncated | tokenPresent=${(token?.length ?? 0) > 0} | requestId=$requestId | limit=$limit');

      final response = await http
          .get(
            Uri.parse(endpointUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Request-ID': requestId,
            },
          )
          .timeout(requestTimeout);

      final contentType = response.headers['content-type'] ?? 'unknown';
      final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
      debugPrint('[WhatsAppApiService] getInbox: AFTER response | statusCode=${response.statusCode} | content-type=$contentType | bodyLength=${response.body.length} | bodyPrefix=$bodyPrefix | requestId=$requestId');

      if (_isNonJsonResponse(response)) {
        _throwNonJsonNetworkException(response, endpointUrl);
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        Map<String, dynamic>? errorBody;
        try {
          errorBody = SafeJson.tryDecodeJsonMap(response.body);
        } catch (_) {
          errorBody = null;
        }
        String message;
        if (errorBody != null) {
          message = errorBody['message'] as String? ?? 'HTTP ${response.statusCode}';
          debugPrint('[WhatsAppApiService] getInbox: error=${errorBody['error']}, message=$message');
        } else {
          message = 'HTTP ${response.statusCode} (non-JSON response). content-type=$contentType. bodyPrefix=$bodyPrefix';
          debugPrint('[WhatsAppApiService] getInbox: non-JSON error response, bodyPrefix=$bodyPrefix');
        }
        throw ErrorMapper.fromHttpException(response.statusCode, message);
      }

      Map<String, dynamic>? data;
      try {
        data = SafeJson.tryDecodeJsonMap(response.body);
      } catch (e) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
          originalError: e,
        );
      }
      if (data == null) {
        throw NetworkException(
          'Invalid response: failed to decode JSON. endpoint=$endpointUrl, status=${response.statusCode}, content-type=$contentType, bodyPrefix=$bodyPrefix',
          code: 'json_decode_failed',
        );
      }
      debugPrint('[WhatsAppApiService] getInbox: success, messagesCount=${data['messages']?.length ?? 0}');
      return data;
    });
  }

  /// GET /api/whatsapp/auto-reply-settings/:accountId
  /// Returns: { success: bool, enabled: bool, prompt: string }
  Future<Map<String, dynamic>> getAutoReplySettings({required String accountId}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw UnauthorizedException();
    final token = await user.getIdToken();
    final backendUrl = _requireBackendUrl();
    final requestId = _generateRequestId();
    final endpointUrl = '$backendUrl/api/whatsapp/auto-reply-settings/$accountId';

    debugPrint('[WhatsAppApiService] getAutoReplySettings: $endpointUrl');
    final response = await http
        .get(
          Uri.parse(endpointUrl),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Request-ID': requestId,
          },
        )
        .timeout(requestTimeout);

    if (_isNonJsonResponse(response)) {
      _throwNonJsonNetworkException(response, endpointUrl);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = SafeJson.tryDecodeJsonMap(response.body);
      final message = errorBody?['message'] as String? ?? 'HTTP ${response.statusCode}';
      throw ErrorMapper.fromHttpException(response.statusCode, message);
    }
    final data = SafeJson.tryDecodeJsonMap(response.body);
    if (data == null) {
      throw NetworkException(
        'Invalid response: failed to decode JSON. endpoint=$endpointUrl',
        code: 'json_decode_failed',
      );
    }
    return data;
  }

  /// POST /api/whatsapp/auto-reply-settings/:accountId
  /// Body: { enabled: bool, prompt: string }
  /// Returns: { success: bool, enabled: bool, prompt: string? }
  Future<Map<String, dynamic>> setAutoReplySettings({
    required String accountId,
    required bool enabled,
    required String prompt,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw UnauthorizedException();
    final token = await user.getIdToken();
    final backendUrl = _requireBackendUrl();
    final requestId = _generateRequestId();
    final endpointUrl = '$backendUrl/api/whatsapp/auto-reply-settings/$accountId';

    debugPrint('[WhatsAppApiService] setAutoReplySettings: $endpointUrl enabled=$enabled');
    final response = await http
        .post(
          Uri.parse(endpointUrl),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Request-ID': requestId,
          },
          body: jsonEncode({'enabled': enabled, 'prompt': prompt}),
        )
        .timeout(requestTimeout);

    if (_isNonJsonResponse(response)) {
      _throwNonJsonNetworkException(response, endpointUrl);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorBody = SafeJson.tryDecodeJsonMap(response.body);
      final message = errorBody?['message'] as String? ?? 'HTTP ${response.statusCode}';
      throw ErrorMapper.fromHttpException(response.statusCode, message);
    }
    final data = SafeJson.tryDecodeJsonMap(response.body);
    if (data == null) {
      throw NetworkException(
        'Invalid response: failed to decode JSON. endpoint=$endpointUrl',
        code: 'json_decode_failed',
      );
    }
    return data;
  }

  /// POST whatsappProxyBackfillAccount (Functions HTTP) – super-admin only.
  /// Forwards to backend POST /api/whatsapp/backfill/:accountId.
  /// Logs requestId, uid, accountId. On configuration_missing, throws with
  /// code 'configuration_missing' so UI can show explicit env hint.
  Future<Map<String, dynamic>> backfillAccountViaProxy({
    required String accountId,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw UnauthorizedException();

    final token = await user.getIdToken();
    final functionsUrl = _getFunctionsUrl();
    final requestId = _generateRequestId();
    final uidTruncated = user.uid.length >= 8 ? '${user.uid.substring(0, 8)}...' : user.uid;
    final endpointUrl = '$functionsUrl/whatsappProxyBackfillAccount';

    debugPrint('[WhatsAppApiService] backfillAccountViaProxy: requestId=$requestId uid=$uidTruncated accountId=${_maskId(accountId)}');

    final response = await http
        .post(
          Uri.parse('$endpointUrl?accountId=${Uri.encodeComponent(accountId)}'),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Request-ID': requestId,
          },
          body: jsonEncode({'accountId': accountId}),
        )
        .timeout(requestTimeout);

    final contentType = response.headers['content-type'] ?? 'unknown';
    final bodyPrefix = SafeJson.bodyPreview(response.body, max: 200);
    debugPrint('[WhatsAppApiService] backfillAccountViaProxy: AFTER status=${response.statusCode} content-type=$contentType bodyPrefix=$bodyPrefix requestId=$requestId');

    if (_isNonJsonResponse(response)) {
      _throwNonJsonNetworkException(response, endpointUrl);
    }

    final data = SafeJson.tryDecodeJsonMap(response.body);
    if (data != null && data['error'] == 'configuration_missing') {
      throw NetworkException(
        'Functions missing WHATSAPP_BACKEND_URL / WHATSAPP_BACKEND_BASE_URL secret. Set backend URL in Firebase Functions env.',
        code: 'configuration_missing',
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = data?['message'] as String? ?? 'HTTP ${response.statusCode}';
      throw ErrorMapper.fromHttpException(response.statusCode, message);
    }

    if (data == null) {
      throw NetworkException(
        'Invalid response: failed to decode JSON. endpoint=$endpointUrl',
        code: 'json_decode_failed',
      );
    }
    return data;
  }
}
