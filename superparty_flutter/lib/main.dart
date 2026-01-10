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
    return ChangeNotifierProvider(
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
          // CRITICAL: Check Firebase initialization before showing app
          // This prevents [core/no-app] error on web
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
          
          // UpdateGate as overlay - preserves Directionality from MaterialApp
          return UpdateGate(child: child ?? const SizedBox.shrink());
        },
        onGenerateRoute: (settings) {
          // Debug: log raw route
          debugPrint('[ROUTE] Raw: ${settings.name}');
          
          // Normalize route: handle /#/evenimente, query params, trailing slash
          final raw = settings.name ?? '/';
          final cleaned = raw.startsWith('/#') ? raw.substring(2) : raw; // "/#/x" -> "/x"
          final uri = Uri.tryParse(cleaned) ?? Uri(path: cleaned);
          final path = uri.path.isEmpty ? '/' : uri.path;
          
          debugPrint('[ROUTE] Normalized: $path');
          
          // Handle all routes including deep-links
          switch (path) {
            case '/':
              return MaterialPageRoute(builder: (_) => const AuthWrapper());
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
              debugPrint('[ROUTE] Unknown path: $path - showing NotFoundScreen');
              return MaterialPageRoute(
                builder: (_) => NotFoundScreen(routeName: path),
              );
          }
        },
        onUnknownRoute: (settings) {
          debugPrint('[ROUTE] onUnknownRoute called for: ${settings.name}');
          return MaterialPageRoute(
            builder: (_) => NotFoundScreen(routeName: settings.name),
          );
        }
      ),
    );
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  final RoleService _roleService = RoleService();
  
  // Guards to prevent rebuild loops
  bool _roleLoaded = false;
  bool _backgroundServiceStarted = false;
  String? _lastUid;

  /// Load user role from staffProfiles and update AppState
  Future<void> _loadUserRole(BuildContext context) async {
    try {
      final appState = Provider.of<AppStateProvider>(context, listen: false);
      final role = await _roleService.getUserRole();
      final isEmployee = role != null;
      
      appState.setEmployeeStatus(isEmployee, role);
    } catch (e) {
      print('Error loading user role: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    // Note: Update check is now handled by UpdateGate
    // This widget only handles auth routing
    
    // CRITICAL: Wait for Firebase to be initialized before accessing any Firebase services
    // This prevents [core/no-app] error on web
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
    
    return StreamBuilder<User?>(
      stream: FirebaseService.auth.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
          );
        }
        
        if (snapshot.hasData) {
          final uid = snapshot.data!.uid;
          
          // Reset guards when user changes
          if (_lastUid != uid) {
          _lastUid = uid;
          _roleLoaded = false;
          _backgroundServiceStarted = false;
          }
          
          // Start background service only once per user (mobile only)
          if (!kIsWeb && !_backgroundServiceStarted) {
          _backgroundServiceStarted = true;
          BackgroundService.startService().catchError((e) {
            print('Failed to start background service: $e');
            return false; // IMPORTANT: catchError must return Future<bool>
          });
          }
          
          // Load user role only once per user (post-frame to avoid rebuild loop)
          if (!_roleLoaded) {
          _roleLoaded = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _loadUserRole(context);
          });
          }
          
          // Check user status in Firestore
          return StreamBuilder<DocumentSnapshot>(
          stream: FirebaseService.firestore
              .collection('users')
              .doc(snapshot.data!.uid)
              .snapshots(),
          builder: (context, userSnapshot) {
            if (userSnapshot.connectionState == ConnectionState.waiting) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            
            if (userSnapshot.hasData && userSnapshot.data!.exists) {
              final userData = userSnapshot.data!.data() as Map<String, dynamic>?;
              final status = userData?['status'] ?? '';
              
              if (status == 'kyc_required') {
                return const KycScreen();
              }
            }
            
            return const HomeScreen();
          },
          );
        }
        
        // On logout, reset role flags
        if (_lastUid != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            final appState = Provider.of<AppStateProvider>(context, listen: false);
            appState.clearRoles();
          }
          });
          _lastUid = null;
          _roleLoaded = false;
          _backgroundServiceStarted = false;
        }
        
        return const LoginScreen();
      },
    );
  }
}
