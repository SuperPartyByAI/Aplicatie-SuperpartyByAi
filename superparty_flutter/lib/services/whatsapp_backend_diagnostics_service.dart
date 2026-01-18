import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_functions/cloud_functions.dart';
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
  final String? timestamp;
  final String? error;

  BackendDiagnostics({
    required this.ready,
    required this.mode,
    this.reason,
    this.instanceId,
    this.timestamp,
    this.error,
  });

  factory BackendDiagnostics.fromJson(Map<String, dynamic> json) {
    return BackendDiagnostics(
      ready: json['ready'] ?? false,
      mode: json['mode'] ?? 'unknown',
      reason: json['reason'],
      instanceId: json['instanceId'],
      timestamp: json['timestamp'],
      error: json['error'],
    );
  }

  bool get isPassive => mode == 'passive';
  bool get isActive => mode == 'active';
}

/// Service for checking Railway WhatsApp backend health and mode.
/// 
/// Checks /ready endpoint to determine if backend is active/passive.
class WhatsAppBackendDiagnosticsService {
  static final WhatsAppBackendDiagnosticsService _instance =
      WhatsAppBackendDiagnosticsService._internal();
  factory WhatsAppBackendDiagnosticsService() => _instance;
  WhatsAppBackendDiagnosticsService._internal();

  static WhatsAppBackendDiagnosticsService get instance => _instance;

  /// Get Functions URL (for proxy calls if needed)
  String _getFunctionsUrl() {
    const region = 'us-central1';
    
    try {
      final app = Firebase.app();
      final projectId = app.options.projectId;
      if (projectId.isNotEmpty) {
        return 'https://$region-$projectId.cloudfunctions.net';
      }
    } catch (_) {
      // Fallback if Firebase not initialized
    }
    
    return 'https://$region-superparty-frontend.cloudfunctions.net';
  }

  /// Get backend base URL (direct Railway URL)
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
        debugPrint('[BackendDiagnostics] Response body: ${response.body}');
      }

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return BackendDiagnostics.fromJson(json);
      } else if (response.statusCode == 502) {
        // Backend down
        return BackendDiagnostics(
          ready: false,
          mode: 'unknown',
          reason: 'backend_down',
          error: 'Backend returned 502 Bad Gateway',
        );
      } else if (response.statusCode == 503) {
        // Backend passive (may return 503, but we check /ready which returns 200 with mode=passive)
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return BackendDiagnostics.fromJson(json);
      } else {
        return BackendDiagnostics(
          ready: false,
          mode: 'unknown',
          reason: 'unexpected_status',
          error: 'Backend returned status ${response.statusCode}',
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
