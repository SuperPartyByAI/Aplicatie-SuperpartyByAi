import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:provider/provider.dart';
import 'services/firebase_service.dart';
import 'services/background_service.dart';
import 'services/push_notification_service.dart';
import 'providers/app_state_provider.dart';
import 'router/app_router.dart';
import 'widgets/update_gate.dart';

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
  
  // FAIL-SAFE: Initialize Firebase with error handling and timeout
  // App can run with limited functionality if Firebase fails
  try {
    debugPrint('[Main] Initializing Firebase...');
    await FirebaseService.initialize()
        .timeout(const Duration(seconds: 10));
    debugPrint('[Main] ✅ Firebase initialized successfully');
  } catch (e, stackTrace) {
    debugPrint('[Main] ❌ Firebase initialization failed: $e');
    debugPrint('[Main] Stack trace: $stackTrace');
    debugPrint('[Main] ⚠️ App will continue with limited functionality');
    debugPrint('[Main] ℹ️ Features requiring Firebase will be unavailable');
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
      debugPrint('[Main] ✅ Push notifications initialized');
    } catch (e) {
      debugPrint('[Main] ⚠️ Push notification init error (non-critical): $e');
    }
  } else {
    debugPrint('[Main] ℹ️ Push notifications skipped (not supported on web)');
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

  @override
  void initState() {
    super.initState();
    // Trigger rebuild when Firebase is initialized
    _waitForFirebase();
  }
  
  Future<void> _waitForFirebase() async {
    // Wait for Firebase to be initialized
    while (!FirebaseService.isInitialized) {
      await Future.delayed(const Duration(milliseconds: 100));
    }
    // Trigger rebuild
    if (mounted) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    // CRITICAL: Wait for Firebase initialization before building any widgets
    // This prevents [core/no-app] error on web
    if (!FirebaseService.isInitialized) {
      return MaterialApp(
        // Accept ANY route during initialization (including deep-links like /#/evenimente)
        // Show loading screen for all routes until Firebase is ready
        onGenerateRoute: (settings) {
          return MaterialPageRoute(
            settings: settings, // Preserve route settings for later navigation
            builder: (context) => const Scaffold(
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
            ),
          );
        },
      );
    }
    
    return ChangeNotifierProvider(
      create: (_) => AppStateProvider(),
      child: MaterialApp.router(
        title: 'SuperParty',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFFDC2626),
            brightness: Brightness.light,
          ),
          useMaterial3: true,
        ),
        darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFFDC2626),
            brightness: Brightness.dark,
          ),
          useMaterial3: true,
        ),
        builder: (context, child) {
          // UpdateGate as overlay - preserves Directionality from MaterialApp
          return UpdateGate(child: child ?? const SizedBox.shrink());
        },
        routerConfig: (_appRouter ??= AppRouter()).router,
      ),
    );
  }
}
