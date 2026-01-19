import 'dart:async' show TimeoutException;
import 'dart:io';
import 'dart:convert';
import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:provider/provider.dart';
import 'services/firebase_service.dart';
import 'services/background_service.dart';
import 'services/push_notification_service.dart';
import 'services/admin_bootstrap_service.dart';
import 'providers/app_state_provider.dart';
import 'router/app_router.dart';
import 'widgets/update_gate.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Global error handlers for debugging
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    debugPrint('[FlutterError] ${details.exceptionAsString()}');
    debugPrint('[FlutterError] Stack: ${details.stack}');
  };
  
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('[UncaughtError] $error');
    debugPrint('[UncaughtError] Stack: $stack');
    return true;
  };
  
  // CRITICAL: Initialize Firebase BEFORE runApp()
  // AppRouter/AdminService will crash if Firebase is not initialized
  // because they access FirebaseService.auth in constructors
  try {
    debugPrint('[Main] Initializing Firebase...');
    await FirebaseService.initialize()
        .timeout(const Duration(seconds: 5), onTimeout: () {
      debugPrint('[Main] ⚠️ Firebase init timeout (5s)');
      throw TimeoutException('Firebase initialization timeout');
    });
    debugPrint('[Main] ✅ Firebase initialized successfully');
  } catch (e, stackTrace) {
    debugPrint('[Main] ❌ Firebase initialization failed: $e');
    if (e is! TimeoutException) {
      debugPrint('[Main] Stack trace: $stackTrace');
    }
    debugPrint('[Main] ⚠️ App will show error screen (Firebase required)');
    debugPrint('[Main] 💡 If using emulators:');
    debugPrint('[Main]   1. Start: npm run emu:android (or npm run emu + scripts/adb_reverse_emulators.ps1)');
    debugPrint('[Main]   2. Verify: npm run emu:check');
    debugPrint('[Main]   3. Run: flutter run --dart-define=USE_EMULATORS=true [--dart-define=USE_ADB_REVERSE=false]');
    
    // Check for common configuration issues
    if (e.toString().contains('firebase_options') || e.toString().contains('google-services')) {
      debugPrint('[Main] 💡 Possible missing config: Check firebase_options.dart or google-services.json');
    }
    
    // Check for timeout (likely emulator connectivity issue)
    if (e is TimeoutException) {
      debugPrint('[Main] 💡 Timeout likely due to emulator connectivity:');
      debugPrint('[Main]      - Android emulator: Use adb reverse OR USE_ADB_REVERSE=false (uses 10.0.2.2)');
      debugPrint('[Main]      - Verify emulators running: npm run emu:check');
    }
  }
  
  // FAIL-SAFE: Background service is optional (mobile only)
  if (!kIsWeb) {
    try {
      debugPrint('[Main] Initializing background service...');
      await BackgroundService.initialize();
      debugPrint('[Main] ✅ Background service initialized');
    } catch (e) {
      debugPrint('[Main] ⚠️ Background service init error (non-critical): $e');
    }
  } else {
    debugPrint('[Main] ℹ️ Background service skipped (not supported on web)');
  }
  
  // FAIL-SAFE: Push notifications are optional (mobile only)
  if (!kIsWeb) {
    try {
      debugPrint('[Main] Initializing push notifications...');
      await PushNotificationService.initialize();
      
      // Set up navigation callback for notification taps
      PushNotificationService.onMessageTap = (accountId, threadId, clientJid) {
        debugPrint('[Main] Notification tapped: accountId=$accountId, threadId=$threadId');
        // Navigation will be handled by AppRouter's listener after app is running
      };
      
      debugPrint('[Main] ✅ Push notifications initialized');
    } catch (e) {
      debugPrint('[Main] ⚠️ Push notification init error (non-critical): $e');
    }
  } else {
    debugPrint('[Main] ℹ️ Push notifications skipped (not supported on web)');
  }
  
  // Add auth state listener for diagnostics
  if (FirebaseService.isInitialized) {
    FirebaseService.auth.authStateChanges().listen((user) async {
      final msg = '[AUTH] state change: user=${user?.uid ?? "null"} email=${user?.email ?? "null"}';
      debugPrint(msg);
      
      // Bootstrap admin access for eligible users (idempotent)
      if (user != null) {
        try {
          final bootstrapService = AdminBootstrapService();
          await bootstrapService.bootstrapIfEligible();
        } catch (e) {
          debugPrint('[Main] ⚠️ Admin bootstrap error (non-critical): $e');
        }
      }
      
      // #region agent log
      try {
        final timestamp = DateTime.now().millisecondsSinceEpoch;
        final logEntry = {
          'id': 'auth_state_$timestamp',
          'timestamp': timestamp,
          'location': 'main.dart:92',
          'message': msg,
          'data': {
            'userId': user?.uid,
            'userEmail': user?.email != null ? '${user!.email!.substring(0, 2)}***' : null,
            'isNull': user == null,
          },
          'sessionId': 'debug-session',
          'runId': 'run1',
          'hypothesisId': 'D',
        };
        final file = File('/Users/universparty/.cursor/debug.log');
        file.writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
      } catch (_) {}
      // #endregion
    });
  }

  debugPrint('[Main] Starting app...');
  runApp(const SuperPartyApp());
}

class SuperPartyApp extends StatefulWidget {
  const SuperPartyApp({super.key});

  @override
  State<SuperPartyApp> createState() => _SuperPartyAppState();
}

class _SuperPartyAppState extends State<SuperPartyApp> {
  AppRouter? _appRouter;
  String? _firebaseInitError;
  bool _isInitializing = false;

  @override
  void initState() {
    super.initState();
    // Check if Firebase initialization failed in main()
    if (!FirebaseService.isInitialized) {
      _firebaseInitError = FirebaseService.initError ?? 
          'Firebase initialization failed or timed out in main()';
      debugPrint('[SuperPartyApp] ⚠️ Firebase not initialized in main()');
      if (_firebaseInitError != null) {
        debugPrint('[SuperPartyApp] Error: $_firebaseInitError');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // CRITICAL: Do NOT create AppRouter/AdminService until Firebase is initialized
    // AppRouter constructor creates AdminService, which accesses FirebaseService.auth
    // This would crash if Firebase is not initialized
    if (!FirebaseService.isInitialized) {
      return MaterialApp(
        title: 'SuperParty',
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark().copyWith(
          extensions: <ThemeExtension<dynamic>>[
            AppColors.dark,
          ],
        ),
        themeMode: ThemeMode.dark,
        home: _buildFirebaseInitScreen(),
      );
    }
    
    // Firebase is initialized - safe to create AppRouter
    return ChangeNotifierProvider(
      create: (_) => AppStateProvider(),
      child: MaterialApp.router(
        title: 'SuperParty',
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark().copyWith(
          extensions: <ThemeExtension<dynamic>>[
            AppColors.dark,
          ],
        ),
        themeMode: ThemeMode.dark,
        builder: (context, child) {
          final content = UpdateGate(child: child ?? const SizedBox.shrink());
          return content;
        },
        routerConfig: (_appRouter ??= AppRouter()).router,
      ),
    );
  }

  Widget _buildFirebaseInitScreen() {
    if (_isInitializing) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Initializing Firebase...'),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.error_outline,
                size: 64,
                color: Colors.red.shade700,
              ),
              const SizedBox(height: 24),
              Text(
                'Firebase Initialization Failed',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.red.shade700,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              if (_firebaseInitError != null)
                Text(
                  _firebaseInitError!,
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
              const SizedBox(height: 8),
              Text(
                'The app cannot start without Firebase. Please check your configuration.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey.shade600,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              ElevatedButton.icon(
                onPressed: () {
                  setState(() {
                    _isInitializing = true;
                    _firebaseInitError = null;
                  });
                  FirebaseService.initialize().then((_) {
                    if (mounted) {
                      setState(() {
                        _isInitializing = false;
                      });
                    }
                  }).catchError((e) {
                    debugPrint('[SuperPartyApp] Retry failed: $e');
                    if (mounted) {
                      setState(() {
                        _isInitializing = false;
                        _firebaseInitError = 'Retry failed: ${e.toString()}';
                      });
                    }
                  });
                },
                icon: const Icon(Icons.refresh),
                label: const Text('Retry Firebase Initialization'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
