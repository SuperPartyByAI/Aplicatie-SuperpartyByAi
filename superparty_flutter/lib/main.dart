import 'dart:async';
import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
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
import 'screens/kyc/kyc_screen.dart';
import 'widgets/update_gate.dart';
import 'routing/app_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Global error handlers for debugging
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    if (kDebugMode) {
      debugPrint('[FlutterError] Exception: ${details.exceptionAsString()}');
      debugPrint('[FlutterError] Library: ${details.library}');
      debugPrint('[FlutterError] Context: ${details.context}');
      debugPrint('[FlutterError] Stack: ${details.stack}');
      debugPrint('[FlutterError] Information: ${details.informationCollector?.call()}');
    }
  };
  
  // ErrorWidget builder pentru debug (doar în debug mode)
  ErrorWidget.builder = (FlutterErrorDetails details) {
    if (kDebugMode) {
      debugPrint('[ErrorWidget] Building error widget for: ${details.exceptionAsString()}');
      debugPrint('[ErrorWidget] Stack: ${details.stack}');
    }
    return ErrorWidget(details.exception);
  };
  
  PlatformDispatcher.instance.onError = (error, stack) {
    if (kDebugMode) {
      debugPrint('[UncaughtError] $error');
      debugPrint('[UncaughtError] Stack: $stack');
    }
    return true;
  };
  
  // FAIL-SAFE: Initialize Firebase with error handling and timeout
  // App can run with limited functionality if Firebase fails
  try {
    if (kDebugMode) debugPrint('[Main] Initializing Firebase...');
    await FirebaseService.initialize()
        .timeout(const Duration(seconds: 10));
    if (kDebugMode) debugPrint('[Main] ✅ Firebase initialized successfully');
  } catch (e, stackTrace) {
    if (kDebugMode) {
      debugPrint('[Main] ❌ Firebase initialization failed: $e');
      debugPrint('[Main] Stack trace: $stackTrace');
      debugPrint('[Main] ⚠️ App will continue with limited functionality');
      debugPrint('[Main] ℹ️ Features requiring Firebase will be unavailable');
    }
  }
  
  // FAIL-SAFE: Background service is optional (mobile only)
  if (!kIsWeb) {
    try {
      if (kDebugMode) debugPrint('[Main] Initializing background service...');
      await BackgroundService.initialize();
      if (kDebugMode) debugPrint('[Main] ✅ Background service initialized');
    } catch (e) {
      if (kDebugMode) debugPrint('[Main] ⚠️ Background service init error (non-critical): $e');
    }
  } else {
    if (kDebugMode) debugPrint('[Main] ℹ️ Background service skipped (not supported on web)');
  }
  
  // FAIL-SAFE: Push notifications are optional (mobile only)
  if (!kIsWeb) {
    try {
      if (kDebugMode) debugPrint('[Main] Initializing push notifications...');
      await PushNotificationService.initialize();
      if (kDebugMode) debugPrint('[Main] ✅ Push notifications initialized');
    } catch (e) {
      if (kDebugMode) debugPrint('[Main] ⚠️ Push notification init error (non-critical): $e');
    }
  } else {
    if (kDebugMode) debugPrint('[Main] ℹ️ Push notifications skipped (not supported on web)');
  }
  
  if (kDebugMode) debugPrint('[Main] Starting app...');
  runApp(const SuperPartyApp());
}

class SuperPartyApp extends StatefulWidget {
  const SuperPartyApp({super.key});

  @override
  State<SuperPartyApp> createState() => _SuperPartyAppState();
}

class _SuperPartyAppState extends State<SuperPartyApp> {
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
    
    // Stable MaterialApp shell - does NOT rebuild on auth changes
    return const AppShell();
  }
}

/// Stable app shell - MaterialApp instance that does NOT rebuild on auth events
class AppShell extends StatelessWidget {
  const AppShell({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
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
      home: const AuthGate(),
      onGenerateRoute: onGenerateRoute,
    );
  }
}

/// Auth gate - decides login vs authenticated flow
/// Uses StreamBuilder for auth state, does NOT own providers
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseService.auth.authStateChanges(),
      initialData: FirebaseService.auth.currentUser,
      builder: (context, snapshot) {
        final user = snapshot.data;
        
        // Show login screen when no user
        if (user == null) {
          return const LoginScreen();
        }
        
        // Wrap authenticated content in UserScope (providers keyed by uid)
        return UserScope(
          uid: user.uid,
          user: user,
        );
      },
    );
  }
}

/// User-scoped subtree - providers recreated per uid
/// When uid changes (login/logout), entire subtree is recreated
class UserScope extends StatelessWidget {
  final String uid;
  final User user;
  
  const UserScope({
    super.key,
    required this.uid,
    required this.user,
  });

  @override
  Widget build(BuildContext context) {
    // Recreate providers per uid - entire subtree replaced on uid change
    return ChangeNotifierProvider<AppStateProvider>(
      key: ValueKey<String>(uid),
      create: (_) => AppStateProvider(),
      child: RoleBootstrapper(
        uid: uid,
        child: StreamBuilder<DocumentSnapshot>(
          stream: FirebaseService.firestore
              .collection('users')
              .doc(user.uid)
              .snapshots(),
          builder: (context, userSnapshot) {
            if (userSnapshot.connectionState == ConnectionState.waiting) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            
            if (userSnapshot.hasData && userSnapshot.data!.exists) {
              final userData = userSnapshot.data!.data() as Map<String, dynamic>;
              final status = userData['status'] ?? '';
              
              if (status == 'kyc_required') {
                return const KycScreen();
              }
            }
            
            return const HomeScreen();
          },
        ),
      ),
    );
  }
}

/// Widget that loads user role in initState (lifecycle-safe)
/// Must be used only when user != null (uid is non-null)
class RoleBootstrapper extends StatefulWidget {
  final String uid;
  final Widget child;
  
  const RoleBootstrapper({
    super.key,
    required this.uid,
    required this.child,
  });

  @override
  State<RoleBootstrapper> createState() => _RoleBootstrapperState();
}

class _RoleBootstrapperState extends State<RoleBootstrapper> {
  final RoleService _roleService = RoleService();
  bool _backgroundServiceStarted = false;

  @override
  void initState() {
    super.initState();
    _loadRoleAndStartServices();
  }

  Future<void> _loadRoleAndStartServices() async {
    if (!mounted) return;
    
    // Capture uid and appState before async gap
    final uidAtRequest = widget.uid;
    final appState = context.read<AppStateProvider>();
    
    // Start background service (mobile only) - only once per widget instance
    if (!kIsWeb && !_backgroundServiceStarted) {
      _backgroundServiceStarted = true;
      BackgroundService.startService().catchError((e) {
        if (kDebugMode) debugPrint('Failed to start background service: $e');
        return false;
      });
    }
    
    try {
      final role = await _roleService.getUserRole();
      final isEmployee = role != null;
      
      // Check mounted and uid still matches after async gap
      if (!mounted) return;
      if (FirebaseService.auth.currentUser?.uid != uidAtRequest) return; // User changed, skip update
      
      // Update app state with role
      appState.setEmployeeStatus(isEmployee, role);
    } catch (e) {
      if (kDebugMode) debugPrint('Error loading user role: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
