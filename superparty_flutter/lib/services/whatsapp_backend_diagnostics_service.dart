import 'dart:convert';
import 'package:flutter/foundation.dart' show kDebugMode, debugPrint;
import 'package:http/http.dart' as http;

import '../core/config/env.dart';
import '../core/errors/app_exception.dart';

/// Backend diagnostics response model
class BackendDiagnostics {
  final bool ready;
  final String mode; // 'active' | 'passive' | 'unknown'
  final String? reason;
  final String? instanceId;
  final String? lockStatus; // 'held_by_this_instance' | 'held_by_other' | 'not_held' | null
  final String? heldBy; // instance ID holding the lock (if passive)
  final int? lockExpiresInSeconds; // seconds until lock expires
  final String? timestamp;
  final String? error;

  BackendDiagnostics({
    required this.ready,
    required this.mode,
    this.reason,
    this.instanceId,
    this.lockStatus,
    this.heldBy,
    this.lockExpiresInSeconds,
    this.timestamp,
    this.error,
  });

  factory BackendDiagnostics.fromJson(Map<String, dynamic> json) {
    return BackendDiagnostics(
      ready: json['ready'] ?? false,
      mode: json['mode'] ?? 'unknown',
      reason: json['reason'],
      instanceId: json['instanceId'],
      lockStatus: json['lockStatus'],
      heldBy: json['heldBy'],
      lockExpiresInSeconds: json['lockExpiresInSeconds'] != null ? (json['lockExpiresInSeconds'] as num).toInt() : null,
      timestamp: json['timestamp'],
      error: json['error'],
    );
  }

  bool get isPassive => mode == 'passive';
  bool get isActive => mode == 'active';
}

/// Service for checking WhatsApp backend health and mode.
/// 
/// Checks /ready endpoint to determine if backend is active/passive.
class WhatsAppBackendDiagnosticsService {
  static final WhatsAppBackendDiagnosticsService _instance =
      WhatsAppBackendDiagnosticsService._internal();
  factory WhatsAppBackendDiagnosticsService() => _instance;
  WhatsAppBackendDiagnosticsService._internal();

  static WhatsAppBackendDiagnosticsService get instance => _instance;

  /// Get backend base URL
  String _getBackendUrl() {
    return Env.whatsappBackendUrl;
  }

  /// Check backend readiness and mode.
  /// 
  /// Returns BackendDiagnostics with:
  /// - ready: true if backend is ready
  /// - mode: 'active' | 'passive' | 'unknown'
  /// - reason: reason for passive mode (if applicable)
  /// - instanceId: backend instance ID
  /// 
  /// Throws AppException on network/auth errors.
  Future<BackendDiagnostics> checkReady() async {
    try {
      final backendUrl = _getBackendUrl();
      if (backendUrl.isEmpty) {
        if (kDebugMode) {
          debugPrint('[BackendDiagnostics] Skipped: WHATSAPP_BACKEND_URL not set');
        }
        return BackendDiagnostics(
          ready: false,
          mode: 'unknown',
          reason: 'backend_url_missing',
          error: 'WHATSAPP_BACKEND_URL not configured',
        );
      }
      final readyUrl = '$backendUrl/ready';

      if (kDebugMode) {
        debugPrint('[BackendDiagnostics] Checking backend ready: $readyUrl');
      }

      final response = await http
          .get(
            Uri.parse(readyUrl),
            headers: {
              'Content-Type': 'application/json',
            },
          )
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () {
              throw TimeoutException('Backend ready check timed out');
            },
          );

      if (kDebugMode) {
        debugPrint('[BackendDiagnostics] Response status: ${response.statusCode}');
        debugPrint('[BackendDiagnostics] Response body (first 500 chars): ${response.body.length > 500 ? response.body.substring(0, 500) + "..." : response.body}');
      }

      if (response.statusCode == 200) {
        // Parse JSON safely - handle non-JSON responses (e.g., 502 HTML)
        try {
          final json = jsonDecode(response.body) as Map<String, dynamic>;
          return BackendDiagnostics.fromJson(json);
        } catch (parseError) {
          // Non-JSON response (e.g., 502 HTML error page)
          if (kDebugMode) {
            debugPrint('[BackendDiagnostics] JSON parse error: $parseError');
            debugPrint('[BackendDiagnostics] Response body was: ${response.body.substring(0, 200)}');
          }
          return BackendDiagnostics(
            ready: false,
            mode: 'unknown',
            reason: 'invalid_response',
            error: 'Backend returned non-JSON response (status ${response.statusCode}). Body: ${response.body.length > 200 ? response.body.substring(0, 200) + "..." : response.body}',
          );
        }
      } else if (response.statusCode == 502) {
        // Backend down - parse body if possible
        String errorBody = 'Backend returned 502 Bad Gateway';
        try {
          if (response.body.isNotEmpty) {
            final first200Chars = response.body.length > 200 ? response.body.substring(0, 200) + '...' : response.body;
            errorBody = 'Backend returned 502 Bad Gateway. Response: $first200Chars';
          }
        } catch (e) {
          // Ignore parse errors
        }
        return BackendDiagnostics(
          ready: false,
          mode: 'unknown',
          reason: 'backend_down',
          error: errorBody,
        );
      } else if (response.statusCode == 503) {
        // Backend passive (may return 503, but we check /ready which returns 200 with mode=passive)
        try {
          final json = jsonDecode(response.body) as Map<String, dynamic>;
          return BackendDiagnostics.fromJson(json);
        } catch (parseError) {
          return BackendDiagnostics(
            ready: false,
            mode: 'unknown',
            reason: 'invalid_response',
            error: 'Backend returned 503 but response was not valid JSON',
          );
        }
      } else {
        return BackendDiagnostics(
          ready: false,
          mode: 'unknown',
          reason: 'unexpected_status',
          error: 'Backend returned status ${response.statusCode}. Body: ${response.body.length > 200 ? response.body.substring(0, 200) + "..." : response.body}',
        );
      }
    } on TimeoutException {
      return BackendDiagnostics(
        ready: false,
        mode: 'unknown',
        reason: 'timeout',
        error: 'Request timed out',
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[BackendDiagnostics] Error: $e');
      }
      return BackendDiagnostics(
        ready: false,
        mode: 'unknown',
        reason: 'error',
        error: e.toString(),
      );
    }
  }
}
