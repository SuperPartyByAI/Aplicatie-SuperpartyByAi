import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';

import '../providers/app_state_provider.dart';
import '../services/background_service.dart';
import '../services/firebase_service.dart';
import '../services/role_service.dart';
import '../screens/auth/login_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/kyc/kyc_screen.dart';
import '../widgets/update_gate.dart';
import '../routing/app_router.dart';

/// Stable app shell - owns the single [MaterialApp] instance.
/// This widget should not be recreated on auth/user state changes.
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

/// Auth gate - decides login vs authenticated flow.
/// Uses [StreamBuilder] for auth state, does NOT own providers.
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

/// User-scoped subtree - providers recreated per uid.
/// When uid changes (login/logout), entire subtree is recreated.
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
              final userData =
                  userSnapshot.data!.data() as Map<String, dynamic>;
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

/// Widget that loads user role in initState (lifecycle-safe).
/// Must be used only when user != null (uid is non-null).
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
        if (kDebugMode) {
          debugPrint('Failed to start background service: $e');
        }
        return false;
      });
    }

    try {
      final role = await _roleService.getUserRole();
      final isEmployee = role != null;

      // Check mounted and uid still matches after async gap
      if (!mounted) return;
      if (FirebaseService.auth.currentUser?.uid != uidAtRequest) {
        // User changed, skip update
        return;
      }

      // Update app state with role
      appState.setEmployeeStatus(isEmployee, role);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Error loading user role: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}

