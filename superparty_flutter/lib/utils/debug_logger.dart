import 'dart:convert';
import 'dart:developer' as developer;
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb, debugPrint;

/// Safe debug logger that works on all platforms (Web, Mobile, Desktop)
/// Replaces hardcoded file paths with platform-agnostic logging
class DebugLogger {
  /// Log a debug entry (only in debug mode)
  /// Uses developer.log on all platforms (safe for Web)
  static void log({
    required String id,
    required String location,
    required String message,
    Map<String, dynamic>? data,
  }) {
    if (!kDebugMode) return; // Only log in debug mode

    try {
      final logEntry = {
        'id': id,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'location': location,
        'message': message,
        if (data != null) 'data': data,
      };

      // Use developer.log (works on all platforms, including Web)
      developer.log(
        jsonEncode(logEntry),
        name: 'SuperParty',
      );
    } catch (e) {
      // Silently fail - logging should never break the app
      debugPrint('DebugLogger error: $e');
    }
  }

  /// Log UI interaction (button tap, navigation, etc.)
  static void logUI({
    required String action,
    required String location,
    Map<String, dynamic>? data,
  }) {
    log(
      id: 'ui_${DateTime.now().millisecondsSinceEpoch}',
      location: location,
      message: '[UI] $action',
      data: data,
    );
  }

  /// Log navigation event
  static void logNavigation({
    required String fromRoute,
    required String toRoute,
    String? location,
  }) {
    log(
      id: 'nav_${DateTime.now().millisecondsSinceEpoch}',
      location: location ?? 'navigation',
      message: '[NAV] $fromRoute -> $toRoute',
      data: {
        'from': fromRoute,
        'to': toRoute,
      },
    );
  }
}
