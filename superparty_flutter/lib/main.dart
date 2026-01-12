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
import 'screens/evenimente/evenimente_screen.dart';
import 'screens/disponibilitate/disponibilitate_screen.dart';
import 'screens/salarizare/salarizare_screen.dart';
import 'screens/centrala/centrala_screen.dart';
import 'screens/whatsapp/whatsapp_screen.dart';
import 'screens/team/team_screen.dart';
import 'screens/admin/admin_screen.dart';
import 'screens/admin/kyc_approvals_screen.dart';
import 'screens/admin/ai_conversations_screen.dart';
import 'screens/admin/firestore_migration_screen.dart';
import 'screens/gm/accounts_screen.dart';
import 'screens/gm/metrics_screen.dart';
import 'screens/gm/analytics_screen.dart';
import 'screens/gm/staff_setup_screen.dart';
import 'screens/ai_chat/ai_chat_screen.dart';
import 'screens/kyc/kyc_screen.dart';
import 'screens/error/not_found_screen.dart';
import 'widgets/update_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Global error handlers for debugging
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    print('[FlutterError] Exception: ${details.exceptionAsString()}');
    print('[FlutterError] Library: ${details.library}');
    print('[FlutterError] Context: ${details.context}');
    print('[FlutterError] Stack: ${details.stack}');
    print('[FlutterError] Information: ${details.informationCollector?.call()}');
  };
  
  // ErrorWidget builder pentru debug (doar în debug mode)
  ErrorWidget.builder = (FlutterErrorDetails details) {
    if (kDebugMode) {
      print('[ErrorWidget] Building error widget for: ${details.exceptionAsString()}');
      print('[ErrorWidget] Stack: ${details.stack}');
    }
    return ErrorWidget(details.exception);
  };
  
  PlatformDispatcher.instance.onError = (error, stack) {
    print('[UncaughtError] $error');
    print('[UncaughtError] Stack: $stack');
    return true;
  };
  
  // FAIL-SAFE: Initialize Firebase with error handling and timeout
  // App can run with limited functionality if Firebase fails
  try {
    print('[Main] Initializing Firebase...');
    await FirebaseService.initialize()
        .timeout(const Duration(seconds: 10));
    print('[Main] ✅ Firebase initialized successfully');
  } catch (e, stackTrace) {
    print('[Main] ❌ Firebase initialization failed: $e');
    print('[Main] Stack trace: $stackTrace');
    print('[Main] ⚠️ App will continue with limited functionality');
    print('[Main] ℹ️ Features requiring Firebase will be unavailable');
  }
  
  // FAIL-SAFE: Background service is optional (mobile only)
  if (!kIsWeb) {
    try {
      print('[Main] Initializing background service...');
      await BackgroundService.initialize();
      print('[Main] ✅ Background service initialized');
    } catch (e) {
      print('[Main] ⚠️ Background service init error (non-critical): $e');
    }
  } else {
    print('[Main] ℹ️ Background service skipped (not supported on web)');
  }
  
  // FAIL-SAFE: Push notifications are optional (mobile only)
  if (!kIsWeb) {
    try {
      print('[Main] Initializing push notifications...');
      await PushNotificationService.initialize();
      print('[Main] ✅ Push notifications initialized');
    } catch (e) {
      print('[Main] ⚠️ Push notification init error (non-critical): $e');
    }
  } else {
    print('[Main] ℹ️ Push notifications skipped (not supported on web)');
  }
  
  print('[Main] Starting app...');
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
    
    // CRITICAL: Recreate AppStateProvider per user uid to avoid InheritedNotifier assertions
    // When uid changes (login/logout), Flutter replaces the entire provider subtree,
    // and the old notifier is properly disposed before new dependents are created
    return StreamBuilder<User?>(
      stream: FirebaseService.auth.authStateChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;
        final uid = user?.uid;
        
        // Create provider with key dependent on uid (null for logout)
        // This ensures provider is recreated when user changes, avoiding notifyListeners during deactivation
        return ChangeNotifierProvider<AppStateProvider>(
          key: ValueKey<String?>(uid),
          create: (_) => AppStateProvider(),
          child: MaterialApp(
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
        onGenerateRoute: (settings) {
          // Debug: log raw route
          print('[ROUTE] Raw: ${settings.name}');
          
          // Normalize route: handle /#/evenimente, query params, trailing slash
          final raw = settings.name ?? '/';
          final cleaned = raw.startsWith('/#') ? raw.substring(2) : raw; // "/#/x" -> "/x"
          final uri = Uri.tryParse(cleaned) ?? Uri(path: cleaned);
          final path = uri.path.isEmpty ? '/' : uri.path;
          
          print('[ROUTE] Normalized: $path');
          
          // Handle all routes including deep-links
          switch (path) {
            case '/':
              return MaterialPageRoute(builder: (_) => AuthWrapper(user: user));
            case '/home':
              return MaterialPageRoute(builder: (_) => const HomeScreen());
            case '/kyc':
              return MaterialPageRoute(builder: (_) => const KycScreen());
            case '/evenimente':
              return MaterialPageRoute(builder: (_) => const EvenimenteScreen());
            case '/disponibilitate':
              return MaterialPageRoute(builder: (_) => const DisponibilitateScreen());
            case '/salarizare':
              return MaterialPageRoute(builder: (_) => const SalarizareScreen());
            case '/centrala':
              return MaterialPageRoute(builder: (_) => const CentralaScreen());
            case '/whatsapp':
              return MaterialPageRoute(builder: (_) => const WhatsAppScreen());
            case '/team':
              return MaterialPageRoute(builder: (_) => const TeamScreen());
            case '/admin':
              return MaterialPageRoute(builder: (_) => const AdminScreen());
            case '/admin/kyc':
              return MaterialPageRoute(builder: (_) => const KycApprovalsScreen());
            case '/admin/ai-conversations':
              return MaterialPageRoute(builder: (_) => const AiConversationsScreen());
            case '/admin/firestore-migration':
              return MaterialPageRoute(builder: (_) => const FirestoreMigrationScreen());
            case '/gm/accounts':
              return MaterialPageRoute(builder: (_) => const AccountsScreen());
            case '/gm/metrics':
              return MaterialPageRoute(builder: (_) => const MetricsScreen());
            case '/gm/analytics':
              return MaterialPageRoute(builder: (_) => const AnalyticsScreen());
            case '/gm/staff-setup':
              return MaterialPageRoute(builder: (_) => const StaffSetupScreen());
            case '/ai-chat':
              return MaterialPageRoute(builder: (_) => const AIChatScreen());
            default:
              print('[ROUTE] Unknown path: $path - showing NotFoundScreen');
              return MaterialPageRoute(
                builder: (_) => NotFoundScreen(routeName: path),
              );
          }
        },
        onUnknownRoute: (settings) {
          print('[ROUTE] onUnknownRoute called for: ${settings.name}');
          return MaterialPageRoute(
            builder: (_) => NotFoundScreen(routeName: settings.name ?? ''),
          );
        },
      ),
        );
      },
    );
  }
}

/// Pure routing widget - receives user from parent StreamBuilder
/// No auth subscriptions, no state management, no side effects
class AuthWrapper extends StatelessWidget {
  final User? user;
  
  const AuthWrapper({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    // Wait for Firebase initialization
    if (!FirebaseService.isInitialized) {
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
    
    // Show login screen when no user
    if (user == null) {
      return const LoginScreen();
    }
    
    // Wrap authenticated content with RoleBootstrapper
    return RoleBootstrapper(
      uid: user!.uid,
      child: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseService.firestore
            .collection('users')
            .doc(user!.uid)
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
        print('Failed to start background service: $e');
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
      print('Error loading user role: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
