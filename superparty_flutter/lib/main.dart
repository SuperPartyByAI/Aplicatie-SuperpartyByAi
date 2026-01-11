import 'dart:async' show runZonedGuarded;
import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode, debugPrint;
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

  // Custom error widget builder (no MaterialApp to avoid nesting)
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Material(
        color: const Color(0xFF0A0E27),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 64, color: Colors.red),
                const SizedBox(height: 16),
                const Text(
                  'Something went wrong',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                if (kDebugMode) ...[
                  const SizedBox(height: 16),
                  Text(
                    details.exceptionAsString(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: Colors.white70),
                  ),
                ] else
                  const Text(
                    'Please restart the app',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  };

  // FAIL-SAFE: Initialize Firebase with error handling and timeout
  // App can run with limited functionality if Firebase fails
  try {
    debugPrint('[Main] Initializing Firebase...');
    await FirebaseService.initialize().timeout(const Duration(seconds: 10));
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

  // Wrap app in error zone to catch async errors
  runZonedGuarded(
    () => runApp(const SuperPartyApp()),
    (error, stack) {
      debugPrint('[ZonedGuarded] Uncaught async error: $error');
      debugPrint('[ZonedGuarded] Stack: $stack');
    },
  );
}

class SuperPartyApp extends StatefulWidget {
  const SuperPartyApp({super.key});

  @override
  State<SuperPartyApp> createState() => _SuperPartyAppState();
}

class _SuperPartyAppState extends State<SuperPartyApp> {
  int _retryCount = 0;
  static const int _maxRetries = 3;

  @override
  void initState() {
    super.initState();
    // Check bootstrap status (no polling loop)
    _checkBootstrapStatus();
  }

  void _checkBootstrapStatus() {
    // If Firebase init failed in main(), status will be failed
    // If it succeeded, status will be success
    // No need to poll - just check once and rebuild
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _retryBootstrap() async {
    if (_retryCount >= _maxRetries) {
      if (mounted) {
        setState(() {});
      }
      return;
    }

    // Calculate timeout BEFORE incrementing (retry 1/2/3 → 10/20/40s)
    final timeout = Duration(seconds: 10 * (1 << _retryCount));

    setState(() {
      _retryCount++;
    });

    try {
      debugPrint(
          '[Bootstrap] Retry $_retryCount/$_maxRetries with ${timeout.inSeconds}s timeout');

      FirebaseService.resetForRetry();
      await FirebaseService.initialize().timeout(timeout);

      if (mounted) {
        setState(() {});
      }
    } catch (e) {
      debugPrint('[Bootstrap] Retry $_retryCount failed: $e');
      if (mounted) {
        setState(() {});
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = FirebaseService.status;

    // Show error UI if Firebase init failed
    if (status == BootstrapStatus.failed) {
      return MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  const Text(
                    'Initialization Failed',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    FirebaseService.lastError ?? 'Unknown error',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 24),
                  if (_retryCount < _maxRetries)
                    ElevatedButton(
                      onPressed: _retryBootstrap,
                      child: Text('Retry ($_retryCount/$_maxRetries)'),
                    )
                  else
                    const Text(
                      'Max retries reached. Please restart the app.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.red),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // Show loading UI while initializing
    if (status == BootstrapStatus.loading || !FirebaseService.isInitialized) {
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
          debugPrint('[ROUTE] Raw: ${settings.name}');

          // Normalize route: handle /#/evenimente, query params, trailing slash
          final raw = settings.name ?? '/';
          final cleaned =
              raw.startsWith('/#') ? raw.substring(2) : raw; // "/#/x" -> "/x"
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
              return MaterialPageRoute(
                  builder: (_) => const EvenimenteScreen());
            case '/disponibilitate':
              return MaterialPageRoute(
                  builder: (_) => const DisponibilitateScreen());
            case '/salarizare':
              return MaterialPageRoute(
                  builder: (_) => const SalarizareScreen());
            case '/centrala':
              return MaterialPageRoute(builder: (_) => const CentralaScreen());
            case '/whatsapp':
              return MaterialPageRoute(builder: (_) => const WhatsAppScreen());
            case '/team':
              return MaterialPageRoute(builder: (_) => const TeamScreen());
            case '/admin':
              return MaterialPageRoute(builder: (_) => const AdminScreen());
            case '/admin/kyc':
              return MaterialPageRoute(
                  builder: (_) => const KycApprovalsScreen());
            case '/admin/ai-conversations':
              return MaterialPageRoute(
                  builder: (_) => const AiConversationsScreen());
            case '/gm/accounts':
              return MaterialPageRoute(builder: (_) => const AccountsScreen());
            case '/gm/metrics':
              return MaterialPageRoute(builder: (_) => const MetricsScreen());
            case '/gm/analytics':
              return MaterialPageRoute(builder: (_) => const AnalyticsScreen());
            case '/gm/staff-setup':
              return MaterialPageRoute(
                  builder: (_) => const StaffSetupScreen());
            case '/ai-chat':
              return MaterialPageRoute(builder: (_) => const AIChatScreen());
            default:
              debugPrint(
                  '[ROUTE] Unknown path: $path - showing NotFoundScreen');
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
      debugPrint('Error loading user role: $e');
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
              debugPrint('Failed to start background service: $e');
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
                final raw = userSnapshot.data!.data();

                // Validate data structure before casting
                if (raw is! Map<String, dynamic>) {
                  debugPrint(
                      '[AuthWrapper] Invalid user data structure: ${raw.runtimeType}');
                  return Scaffold(
                    body: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.error_outline,
                              size: 64, color: Colors.red),
                          const SizedBox(height: 16),
                          const Text(
                            'Account data error',
                            style: TextStyle(
                                fontSize: 20, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                              'Please contact support or try logging out and back in.'),
                          const SizedBox(height: 24),
                          ElevatedButton(
                            onPressed: () async {
                              await FirebaseService.auth.signOut();
                            },
                            child: const Text('Sign Out'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                final userData = raw;
                final status = userData['status'] ?? '';

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
              final appState =
                  Provider.of<AppStateProvider>(context, listen: false);
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
