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
  // CRITICAL: Single instance of AppStateProvider to avoid InheritedNotifier assertion failures
  // Provider must not be recreated on rebuild to maintain stable widget tree
  final AppStateProvider _appState = AppStateProvider();

  @override
  void initState() {
    super.initState();
    // Trigger rebuild when Firebase is initialized
    _waitForFirebase();
  }

  @override
  void dispose() {
    _appState.dispose();
    super.dispose();
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
    
    return ChangeNotifierProvider.value(
      value: _appState,
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
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  final RoleService _roleService = RoleService();
  
  // Current user state - used instead of StreamBuilder to avoid conflicts
  User? _currentUser;
  
  // Guards to prevent rebuild loops
  bool _roleLoaded = false;
  bool _backgroundServiceStarted = false;
  String? _lastUid;
  StreamSubscription<User?>? _authSubscription;

  @override
  void initState() {
    super.initState();
    // Initialize current user from Firebase auth
    _currentUser = FirebaseService.auth.currentUser;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    
    // Set up auth state listener once (guard: only if subscription doesn't exist)
    // CRITICAL: Subscription must be created in didChangeDependencies (not initState)
    // to access Provider.of safely, and only once to avoid duplicate subscriptions
    if (_authSubscription == null && FirebaseService.isInitialized) {
      // Get AppStateProvider once to use in listener
      final appState = Provider.of<AppStateProvider>(context, listen: false);
      
      _authSubscription = FirebaseService.auth.authStateChanges().listen((user) {
        if (!mounted) return;
        
        // Update state
        setState(() {
          _currentUser = user;
        });
        
        if (user != null) {
          final uid = user.uid;
          
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
              return false;
            });
          }
          
          // Load user role only once per user
          if (!_roleLoaded) {
            _roleLoaded = true;
            _loadUserRole(appState);
          }
        } else {
          // On logout: clear roles directly in listener (no post-frame callback/microtask)
          // This avoids notifyListeners during widget tree deactivation
          _lastUid = null;
          _roleLoaded = false;
          _backgroundServiceStarted = false;
          appState.clearRoles();
        }
      });
      
      // Handle initial auth state
      if (_currentUser != null) {
        final uid = _currentUser!.uid;
        _lastUid = uid;
        
        // Start background service (mobile only)
        if (!kIsWeb && !_backgroundServiceStarted) {
          _backgroundServiceStarted = true;
          BackgroundService.startService().catchError((e) {
            print('Failed to start background service: $e');
            return false;
          });
        }
        
        // Load user role
        if (!_roleLoaded) {
          _roleLoaded = true;
          _loadUserRole(appState);
        }
      }
    }
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    super.dispose();
  }

  /// Load user role from staffProfiles and update AppState
  /// CRITICAL: appState is captured before async gap to avoid using context after await
  Future<void> _loadUserRole(AppStateProvider appState) async {
    if (!mounted) return;
    
    // Capture uid at request time to guard against user changes
    final uidAtRequest = _lastUid;
    if (uidAtRequest == null) return;
    
    try {
      final role = await _roleService.getUserRole();
      final isEmployee = role != null;
      
      // CRITICAL: Check mounted after async gap
      if (!mounted) return;
      
      // Guard: verify user hasn't changed during async operation
      if (_lastUid != uidAtRequest) {
        return; // User changed, skip update
      }
      
      // Use captured appState (no context access after async gap)
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
    
    // CRITICAL: build() method must be pure - no side effects, no provider calls, no callbacks
    // Use _currentUser state instead of StreamBuilder to avoid conflicts with subscription
    if (_currentUser == null) {
      return const LoginScreen();
    }
    
    // Check user status in Firestore
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseService.firestore
          .collection('users')
          .doc(_currentUser!.uid)
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
    );
  }
}
