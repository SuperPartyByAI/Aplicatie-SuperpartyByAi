import 'dart:async' show TimeoutException;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode, debugPrint;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state_provider.dart';
import '../../services/background_service.dart';
import '../../services/firebase_service.dart';
import '../../services/role_service.dart';
import '../auth/login_screen.dart';
import '../home/home_screen.dart';
import '../kyc/kyc_screen.dart';

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
  bool _returnRouteHandled = false; // Track if we've handled return-after-login

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
    // CRITICAL: Wait for Firebase initialization before accessing any Firebase services
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

    // Check for return route in query params
    final returnRoute = GoRouterState.of(context).uri.queryParameters['from'];

    // CRITICAL FIX: Add timeout to authStateChanges to prevent infinite waiting
    // If timeout occurs, use currentUser as fallback (or null if not logged in)
    final authStream = FirebaseService.auth.authStateChanges().timeout(
      kDebugMode ? const Duration(seconds: 30) : const Duration(seconds: 5),
      onTimeout: (sink) {
        debugPrint('[AuthWrapper] ⚠️ Auth stream timeout - using currentUser as fallback');
        final currentUser = FirebaseService.auth.currentUser;
        sink.add(currentUser);
        sink.close();
      },
    );
    
    return StreamBuilder<User?>(
      stream: authStream,
      builder: (context, snapshot) {
        // CRITICAL FIX: Check for error/timeout BEFORE waiting state
        // Prevents black screen when auth stream times out or errors
        if (snapshot.hasError) {
          debugPrint('[AuthWrapper] ⚠️ Auth stream error: ${snapshot.error}');
          return _buildAuthErrorScreen(context, snapshot.error.toString());
        }
        
        // CRITICAL FIX: If snapshot has no data and no error after timeout, show timeout screen
        // This prevents black screen when timeout occurs (onTimeout emits currentUser but snapshot might be empty)
        if (snapshot.connectionState == ConnectionState.done && !snapshot.hasData && !snapshot.hasError) {
          debugPrint('[AuthWrapper] ⚠️ Auth stream completed with no data (timeout likely occurred)');
          return _buildAuthTimeoutScreen(context);
        }
        
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
            _returnRouteHandled = false;
          }

          // Handle return-after-login: navigate to the route specified in ?from= param
          if (returnRoute != null && !_returnRouteHandled && mounted) {
            _returnRouteHandled = true;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                try {
                  final decodedRoute = Uri.decodeComponent(returnRoute);
                  debugPrint('[AuthWrapper] Navigating to return route: $decodedRoute');
                  context.go(decodedRoute);
                } catch (e) {
                  debugPrint('[AuthWrapper] Error parsing return route: $e');
                  // Fallback to home if route is invalid
                  if (mounted) context.go('/home');
                }
                return; // Exit early - navigation will rebuild
              }
            });
          }

          // Start background service only once per user (mobile only)
          if (!kIsWeb && !_backgroundServiceStarted) {
            _backgroundServiceStarted = true;
            BackgroundService.startService().catchError((e) {
              debugPrint('Failed to start background service: $e');
              return false;
            });
          }

          // Load user role only once per user (post-frame to avoid rebuild loop)
          if (!_roleLoaded) {
            _roleLoaded = true;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) _loadUserRole(context);
            });
          }

          // Check user status in Firestore (with timeout to prevent hanging)
          // CRITICAL FIX: Longer timeout in debug mode for emulator connectivity
          // Production: 5s (fast feedback), Debug: 30s (allow emulator cold start)
          final firestoreTimeout = kDebugMode ? const Duration(seconds: 30) : const Duration(seconds: 5);
          return StreamBuilder<DocumentSnapshot>(
            stream: FirebaseService.firestore
                .collection('users')
                .doc(uid)
                .snapshots()
                .timeout(
                  firestoreTimeout,
                  onTimeout: (sink) {
                    debugPrint('[AuthWrapper] ⚠️ Firestore stream timeout (${firestoreTimeout.inSeconds}s) - emulator may be down');
                    sink.addError(TimeoutException('Firestore connection timeout'));
                  },
                ),
            builder: (context, userSnapshot) {
              if (userSnapshot.connectionState == ConnectionState.waiting) {
                return const Scaffold(
                  body: Center(child: CircularProgressIndicator()),
                );
              }

              // Handle timeout/error - show home screen instead of blocking
              if (userSnapshot.hasError) {
                debugPrint('[AuthWrapper] ⚠️ Firestore error (showing home anyway): ${userSnapshot.error}');
                return const HomeScreen();
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

        // On logout, reset role flags and return route handling
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
          _returnRouteHandled = false;
        }

        return const LoginScreen();
      },
    );
  }

  /// Build error screen for auth stream errors
  Widget _buildAuthErrorScreen(BuildContext context, String error) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 64,
                color: Color(0xFFFF7878), // --bad
              ),
              const SizedBox(height: 16),
              const Text(
                'Authentication Error',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFEAF1FF), // --text
                ),
              ),
              const SizedBox(height: 8),
              Text(
                error.length > 200 ? '${error.substring(0, 200)}...' : error,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xFFFF7878), // --bad
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  // Retry by rebuilding widget
                  setState(() {});
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4ECDC4), // --accent
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Build timeout screen for auth stream timeouts
  Widget _buildAuthTimeoutScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.wifi_off,
                size: 64,
                color: Color(0xFFFFA726), // Orange for timeout
              ),
              const SizedBox(height: 16),
              const Text(
                'Connection Timeout',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFEAF1FF), // --text
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Firebase emulator may be down or unreachable.\n\nIf using emulators:\n1. Verify: npm run emu:check\n2. Use: --dart-define=USE_EMULATORS=true',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFFEAF1FF), // --text
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  // Retry by rebuilding widget
                  setState(() {});
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4ECDC4), // --accent
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

