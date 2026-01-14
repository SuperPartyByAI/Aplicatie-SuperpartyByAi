import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb, debugPrint;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_state_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/kyc/kyc_screen.dart';
import '../screens/kyc/kyc_pending_screen.dart';
import '../services/background_service.dart';
import '../services/firebase_service.dart';
import '../services/role_service.dart';
import '../widgets/update_gate.dart';
import 'app_router.dart';

/// Stable app shell - owns the single [MaterialApp] instance.
/// Must not be recreated on auth/user changes.
class AppShell extends StatelessWidget {
  const AppShell({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AppStateProvider>(
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
        // IMPORTANT: All gates are applied here, around the Navigator (child).
        builder: (context, child) {
          final nav = child ?? const SizedBox.shrink();

          // Keep a single, stable Overlay/Navigator in the tree.
          // Gates render their UI inside this host (no swapping navigators per state).
          return _GateHostNavigator(
            child: FirebaseInitGate(
              // FirebaseInitGate must be OUTERMOST so nothing Firebase-related is built before init.
              child: UpdateGate(
                child: AuthGate(
                  child: nav,
                ),
              ),
            ),
          );
        },
        onGenerateRoute: onGenerateRoute,
        onUnknownRoute: onUnknownRoute,
      ),
    );
  }
}

/// Deterministic Firebase init gate.
/// Never allows Firebase access (direct or via FirebaseService) before init.
class FirebaseInitGate extends StatefulWidget {
  final Widget child;

  const FirebaseInitGate({super.key, required this.child});

  @override
  State<FirebaseInitGate> createState() => _FirebaseInitGateState();
}

class _FirebaseInitGateState extends State<FirebaseInitGate> {
  bool _ready = FirebaseService.isInitialized;
  Object? _error;
  bool _initializing = false;
  int _retryCount = 0;
  static const int _maxRetries = 3;
  static const List<Duration> _backoffDelays = [
    Duration(seconds: 10),
    Duration(seconds: 20),
    Duration(seconds: 40),
  ];

  @override
  void initState() {
    super.initState();
    if (!_ready) {
      _init();
    }
  }

  Future<void> _init() async {
    if (_initializing) return;
    setState(() {
      _initializing = true;
      _error = null;
    });

    try {
      await FirebaseService.initialize().timeout(const Duration(seconds: 10));
      if (!mounted) return;
      setState(() {
        _ready = true;
        _retryCount = 0;
        _error = null;
      });
    } catch (e, st) {
      debugPrint('[BOOT] Firebase init failed (attempt ${_retryCount + 1}/$_maxRetries): $e');
      debugPrint('[BOOT] Stack: $st');
      if (!mounted) return;

      if (_retryCount < _maxRetries) {
        // Retry with exponential backoff
        final delay = _backoffDelays[_retryCount];
        debugPrint('[BOOT] Retrying in ${delay.inSeconds}s...');
        await Future.delayed(delay);
        if (!mounted) return;
        setState(() {
          _retryCount++;
          _initializing = false;
        });
        // Recursively retry
        _init();
      } else {
        // Max retries exhausted
        setState(() {
          _error = e;
          _initializing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_ready) return widget.child;

    if (_error != null) {
      final isExhausted = _retryCount >= _maxRetries;
      return Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off, size: 48, color: Colors.red),
                  const SizedBox(height: 12),
                  Text(
                    isExhausted
                        ? 'Firebase nu a putut fi inițializat după $_maxRetries încercări.'
                        : 'Firebase nu a putut fi inițializat.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Eroare: $_error',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 14),
                  ),
                  if (!isExhausted) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Încercare ${_retryCount + 1}/$_maxRetries',
                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                  const SizedBox(height: 16),
                  if (isExhausted)
                    const Text(
                      'Te rog repornește aplicația.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 14, color: Colors.grey),
                    )
                  else
                    ElevatedButton(
                      onPressed: _initializing ? null : _init,
                      child: Text(_initializing ? 'Retry...' : 'Retry'),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Initializing Firebase...'),
          ],
        ),
      ),
    );
  }
}

/// Auth gate - decides login vs authenticated flow.
/// Placed around navigator via MaterialApp.builder so deep-links can’t bypass auth.
class AuthGate extends StatelessWidget {
  final Widget child;

  const AuthGate({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    // Safe because FirebaseInitGate guarantees init before building AuthGate.
    return StreamBuilder<User?>(
      stream: FirebaseService.auth.authStateChanges(),
      initialData: FirebaseService.auth.currentUser,
      builder: (context, snapshot) {
        final user = snapshot.data;

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (user == null) {
          return const LoginScreen();
        }

        return UserScope(
          uid: user.uid,
          user: user,
          child: child,
        );
      },
    );
  }
}

/// User-scoped subtree. Builds Firestore stream once in initState.
/// Clears roles on dispose (logout) without post-frame hacks.
class UserScope extends StatefulWidget {
  final String uid;
  final User user;
  final Widget child;

  const UserScope({
    super.key,
    required this.uid,
    required this.user,
    required this.child,
  });

  @override
  State<UserScope> createState() => _UserScopeState();
}

class _UserScopeState extends State<UserScope> {
  late final Stream<DocumentSnapshot<Map<String, dynamic>>> _userDocStream;
  AppStateProvider? _appState;
  bool _ensuredUserDoc = false;

  @override
  void initState() {
    super.initState();
    _userDocStream = FirebaseService.firestore
        .collection('users')
        .doc(widget.uid)
        .snapshots();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _appState ??= context.read<AppStateProvider>();
  }

  @override
  void dispose() {
    // Logout path: user subtree removed => clear roles deterministically.
    _appState?.clearRoles();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RoleBootstrapper(
      uid: widget.uid,
      child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: _userDocStream,
        builder: (context, userSnapshot) {
          if (userSnapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }

          final snap = userSnapshot.data;
          final exists = snap?.exists == true;
          final data = snap?.data();
          final status = data?['status']?.toString() ?? '';

          if (!exists && !_ensuredUserDoc) {
            _ensuredUserDoc = true;
            WidgetsBinding.instance.addPostFrameCallback((_) async {
              try {
                await FirebaseService.firestore
                    .collection('users')
                    .doc(widget.uid)
                    .set(
                  {
                    'status': 'kyc_required',
                    'createdAt': FieldValue.serverTimestamp(),
                    'updatedAt': FieldValue.serverTimestamp(),
                    'updatedBy': widget.uid,
                  },
                  SetOptions(merge: true),
                );
              } catch (e) {
                debugPrint('[AUTH] Failed to ensure user doc: $e');
              }
            });
          }

          if (status == 'kyc_required') {
            return const KycScreen();
          }
          if (status == 'pending') {
            return const KycPendingScreen();
          }
          if (status == 'rejected') {
            return const KycScreen(
              bannerMessage: 'Cererea KYC a fost respinsă. Te rog reîncearcă.',
            );
          }
          if (!exists || status.isEmpty) {
            // Default safe gate: require KYC if user doc missing/empty.
            return const KycScreen();
          }

          // Passed all gates => reveal Navigator child (deep-link preserved).
          return widget.child;
        },
      ),
    );
  }
}

/// Stable host that provides a single [Navigator]/[Overlay] for all gate UIs.
/// The inner app [Navigator] (from [MaterialApp]) is passed as [child].
class _GateHostNavigator extends StatelessWidget {
  final Widget child;

  const _GateHostNavigator({required this.child});

  @override
  Widget build(BuildContext context) {
    return Navigator(
      onGenerateRoute: (settings) {
        return MaterialPageRoute(
          settings: settings,
          builder: (_) => child,
        );
      },
    );
  }
}

/// Loads user role + starts background service in initState (lifecycle-safe).
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

    final uidAtRequest = widget.uid;
    final appState = context.read<AppStateProvider>();

    // Start background service (mobile only) once per widget instance.
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

      if (!mounted) return;
      if (FirebaseService.auth.currentUser?.uid != uidAtRequest) {
        // User changed during async gap.
        return;
      }

      appState.setEmployeeStatus(isEmployee, role);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Error loading user role: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}


