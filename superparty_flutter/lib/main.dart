import 'dart:async';
import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';
import 'services/firebase_service.dart';
import 'services/background_service.dart';
import 'services/push_notification_service.dart';
import 'services/role_service.dart';
import 'providers/app_state_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/evenimente/evenimente_screen.dart';
import 'screens/disponibilitate/disponibilitate_screen.dart';
import 'screens/salarizare/salarizare_screen.dart';
import 'screens/centrala/centrala_screen.dart';
import 'screens/whatsapp/whatsapp_screen.dart';
import 'screens/team/team_screen.dart';
import 'screens/admin/admin_screen.dart';
import 'screens/admin/kyc_approvals_screen.dart';
import 'screens/admin/ai_conversations_screen.dart';
import 'screens/gm/accounts_screen.dart';
import 'screens/gm/metrics_screen.dart';
import 'screens/gm/analytics_screen.dart';
import 'screens/gm/staff_setup_screen.dart';
import 'screens/ai_chat/ai_chat_screen.dart';
import 'screens/kyc/kyc_screen.dart';
import 'screens/error/not_found_screen.dart';
import 'widgets/update_gate.dart';

import 'app/app_shell.dart';

void main() {
  // CRITICAL: Wrap entire app in error zone to catch all unhandled errors
  runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      // Global error handlers - must be set before any Flutter operations
      FlutterError.onError = (details) {
        // Always call default handler first
        FlutterError.presentError(details);
        if (kDebugMode) {
          debugPrint('[FlutterError] Exception: ${details.exceptionAsString()}');
          debugPrint('[FlutterError] Library: ${details.library}');
          debugPrint('[FlutterError] Context: ${details.context}');
          debugPrint('[FlutterError] Stack: ${details.stack}');
          debugPrint(
            '[FlutterError] Information: ${details.informationCollector?.call()}',
          );
        }
        // Forward to zone error handler
        Zone.current.handleUncaughtError(
          details.exception,
          details.stack ?? StackTrace.current,
        );
      };

      // ErrorWidget builder - must NOT create MaterialApp (single MaterialApp rule)
      ErrorWidget.builder = (FlutterErrorDetails details) {
        if (kDebugMode) {
          debugPrint(
            '[ErrorWidget] Building error widget for: '
            '${details.exceptionAsString()}',
          );
          debugPrint('[ErrorWidget] Stack: ${details.stack}');
        }
        // Return minimal error widget without MaterialApp
        return Directionality(
          textDirection: TextDirection.ltr,
          child: Material(
            child: Container(
              color: Colors.red.shade50,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(
                        'A apărut o eroare',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.red.shade900,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        details.exceptionAsString(),
                        style: const TextStyle(fontSize: 14),
                        textAlign: TextAlign.center,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      };

      PlatformDispatcher.instance.onError = (error, stack) {
        if (kDebugMode) {
          debugPrint('[UncaughtError] $error');
          debugPrint('[UncaughtError] Stack: $stack');
        }
        // Forward to zone error handler
        Zone.current.handleUncaughtError(error, stack);
        return true;
      };

      // FAIL-SAFE: Background service is optional (mobile only)
      if (!kIsWeb) {
        try {
          if (kDebugMode) {
            debugPrint('[Main] Initializing background service...');
          }
          await BackgroundService.initialize();
          if (kDebugMode) {
            debugPrint('[Main] ✅ Background service initialized');
          }
        } catch (e) {
          if (kDebugMode) {
            debugPrint(
              '[Main] ⚠️ Background service init error (non-critical): $e',
            );
          }
        }
      } else {
        if (kDebugMode) {
          debugPrint(
            '[Main] ℹ️ Background service skipped (not supported on web)',
          );
        }
      }

      // FAIL-SAFE: Push notifications are optional (mobile only)
      if (!kIsWeb) {
        try {
          if (kDebugMode) {
            debugPrint('[Main] Initializing push notifications...');
          }
          await PushNotificationService.initialize();
          if (kDebugMode) {
            debugPrint('[Main] ✅ Push notifications initialized');
          }
        } catch (e) {
          if (kDebugMode) {
            debugPrint(
              '[Main] ⚠️ Push notification init error (non-critical): $e',
            );
          }
        }
      } else {
        if (kDebugMode) {
          debugPrint(
            '[Main] ℹ️ Push notifications skipped (not supported on web)',
          );
        }
      }

      if (kDebugMode) debugPrint('[Main] Starting app...');
      // NOTE: Firebase init is handled by FirebaseInitGate in AppShell
      // This ensures UI appears immediately and init happens asynchronously
      runApp(const AppShell());
    },
    (error, stack) {
      // Global error handler for uncaught errors outside Flutter framework
      if (kDebugMode) {
        debugPrint('[ZONE_ERROR] Uncaught error: $error');
        debugPrint('[ZONE_ERROR] Stack: $stack');
      }
      // In production, you might want to log to crash reporting service here
    },
  );
}
