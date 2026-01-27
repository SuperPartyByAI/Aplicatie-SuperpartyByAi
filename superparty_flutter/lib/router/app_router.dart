import 'dart:async';
import 'dart:io';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/admin_service.dart';
import '../services/firebase_service.dart';

// Existing app screens
import '../screens/home/home_screen.dart';
import '../screens/kyc/kyc_screen.dart';
import '../screens/evenimente/evenimente_screen.dart';
import '../screens/disponibilitate/disponibilitate_screen.dart';
import '../screens/salarizare/salarizare_screen.dart';
import '../screens/centrala/centrala_screen.dart';
import '../screens/whatsapp/whatsapp_screen.dart';
import '../screens/whatsapp/whatsapp_accounts_screen.dart';
import '../screens/whatsapp/whatsapp_inbox_screen.dart';
import '../screens/whatsapp/whatsapp_chat_screen.dart';
import '../screens/whatsapp/whatsapp_ai_settings_screen.dart';
import '../screens/whatsapp/client_profile_screen.dart';
import '../screens/team/team_screen.dart';
import '../screens/admin/admin_screen.dart';
import '../screens/admin/kyc_approvals_screen.dart';
import '../screens/admin/ai_conversations_screen.dart';
import '../screens/admin/ai_prompts_screen.dart';
import '../screens/gm/accounts_screen.dart';
import '../screens/gm/metrics_screen.dart';
import '../screens/gm/analytics_screen.dart';
import '../screens/gm/staff_setup_screen.dart';
import '../screens/ai_chat/ai_chat_screen.dart';
import '../screens/error/not_found_screen.dart';

// New screens
import '../screens/auth/auth_wrapper.dart';
import '../screens/staff_settings_screen.dart';
import '../screens/admin_dashboard_screen.dart';
import '../screens/admin_user_detail_screen.dart';
import '../widgets/auth_gate.dart';

class AppRouter {
  final AdminService _adminService;

  AppRouter({AdminService? adminService}) : _adminService = adminService ?? AdminService();

  late final GoRouter router = GoRouter(
    debugLogDiagnostics: kDebugMode,
    refreshListenable: GoRouterRefreshStream(
      FirebaseService.auth.authStateChanges().timeout(
        // CRITICAL FIX: Longer timeout in debug mode for emulator connectivity
        // Production: 5s (fast feedback), Debug: 30s (allow emulator cold start)
        kDebugMode ? const Duration(seconds: 30) : const Duration(seconds: 5),
        onTimeout: (sink) {
          debugPrint('[AppRouter] ⚠️ Auth stream timeout (${kDebugMode ? 30 : 5}s) - emulator may be down');
          // CRITICAL FIX: Emit current user (or null) to prevent GoRouter from being stuck
          // Without this, GoRouter has no valid configuration → black screen
          final currentUser = FirebaseService.auth.currentUser;
          sink.add(currentUser);
          sink.close();
        },
      ),
    ),
    redirect: _redirect,
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const AuthWrapper(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const HomeScreen(),
        ),
      ),
      GoRoute(
        path: '/kyc',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const KycScreen(),
        ),
      ),
      GoRoute(
        path: '/evenimente',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const EvenimenteScreen(),
        ),
      ),
      GoRoute(
        path: '/disponibilitate',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const DisponibilitateScreen(),
        ),
      ),
      GoRoute(
        path: '/salarizare',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const SalarizareScreen(),
        ),
      ),
      GoRoute(
        path: '/centrala',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const CentralaScreen(),
        ),
      ),
      GoRoute(
        path: '/whatsapp',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const WhatsAppScreen(),
        ),
        routes: [
          GoRoute(
            path: 'accounts',
            builder: (context, state) => AuthGate(
              fromRoute: state.uri.toString(),
              child: const WhatsAppAccountsScreen(),
            ),
          ),
          GoRoute(
            path: 'inbox',
            builder: (context, state) => AuthGate(
              fromRoute: state.uri.toString(),
              child: const WhatsAppInboxScreen(),
            ),
          ),
          GoRoute(
            path: 'chat',
            builder: (context, state) {
              final accountId = state.uri.queryParameters['accountId'];
              final threadId = state.uri.queryParameters['threadId'];
              final clientJid = state.uri.queryParameters['clientJid'];
              final phoneE164 = state.uri.queryParameters['phoneE164'];
              return AuthGate(
                fromRoute: state.uri.toString(),
                child: WhatsAppChatScreen(
                  accountId: accountId,
                  threadId: threadId,
                  clientJid: clientJid != null ? Uri.decodeComponent(clientJid) : null,
                  phoneE164: phoneE164 != null ? Uri.decodeComponent(phoneE164) : null,
                ),
              );
            },
          ),
          GoRoute(
            path: 'client',
            builder: (context, state) {
              final phoneE164 = state.uri.queryParameters['phoneE164'];
              return AuthGate(
                fromRoute: state.uri.toString(),
                child: ClientProfileScreen(
                  phoneE164: phoneE164 != null ? Uri.decodeComponent(phoneE164) : null,
                ),
              );
            },
          ),
          GoRoute(
            path: 'ai-settings',
            builder: (context, state) {
              final accountId = state.uri.queryParameters['accountId'];
              return AuthGate(
                fromRoute: state.uri.toString(),
                child: WhatsAppAiSettingsScreen(accountId: accountId),
              );
            },
          ),
        ],
      ),
      GoRoute(
        path: '/team',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const TeamScreen(),
        ),
      ),
      GoRoute(
        path: '/ai-chat',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const AIChatScreen(),
        ),
      ),

      // Staff self-setup (new, secure via callables)
      GoRoute(
        path: '/staff-settings',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const StaffSettingsScreen(),
        ),
      ),

      // Admin (new) - protected by redirect logic + AuthGate
      GoRoute(
        path: '/admin',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const AdminDashboardScreen(),
        ),
        routes: [
          GoRoute(
            path: 'user/:uid',
            builder: (context, state) {
              final uid = state.pathParameters['uid'];
              // Safe redirect: if uid is missing or empty, show NotFoundScreen
              if (uid == null || uid.isEmpty) {
                return NotFoundScreen(routeName: state.uri.toString());
              }
              return AuthGate(
                fromRoute: state.uri.toString(),
                child: AdminUserDetailScreen(uid: uid),
              );
            },
          ),

          // Legacy admin tools (existing screens)
          GoRoute(
            path: 'legacy',
            builder: (context, state) => AuthGate(
              fromRoute: state.uri.toString(),
              child: const AdminScreen(),
            ),
          ),
          GoRoute(
            path: 'kyc',
            builder: (context, state) => AuthGate(
              fromRoute: state.uri.toString(),
              child: const KycApprovalsScreen(),
            ),
          ),
          GoRoute(
            path: 'ai-conversations',
            builder: (context, state) => AuthGate(
              fromRoute: state.uri.toString(),
              child: const AiConversationsScreen(),
            ),
          ),
          GoRoute(
            path: 'ai-prompts',
            builder: (context, state) => AuthGate(
              fromRoute: state.uri.toString(),
              child: const AiPromptsScreen(),
            ),
          ),
        ],
      ),

      // GM screens (existing)
      GoRoute(
        path: '/gm/accounts',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const AccountsScreen(),
        ),
      ),
      GoRoute(
        path: '/gm/metrics',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const MetricsScreen(),
        ),
      ),
      GoRoute(
        path: '/gm/analytics',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const AnalyticsScreen(),
        ),
      ),
      GoRoute(
        path: '/gm/staff-setup',
        builder: (context, state) => AuthGate(
          fromRoute: state.uri.toString(),
          child: const StaffSetupScreen(),
        ),
      ),
    ],
    errorBuilder: (context, state) => NotFoundScreen(routeName: state.uri.toString()),
  );

  FutureOr<String?> _redirect(BuildContext context, GoRouterState state) async {
    // #region agent log
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    try {
      final logEntry = {
        'id': 'router_redirect_$timestamp',
        'timestamp': timestamp,
        'location': 'app_router.dart:113',
        'message': '[ROUTER] redirect called',
        'data': {
          'from': state.uri.path,
          'firebaseInitialized': FirebaseService.isInitialized,
        },
        'sessionId': 'debug-session',
        'runId': 'run1',
        'hypothesisId': 'A',
      };
      File('/Users/universparty/.cursor/debug.log').writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
    } catch (_) {}
    // #endregion

    // Wait for Firebase init (main shows a loading MaterialApp until then).
    if (!FirebaseService.isInitialized) {
      // #region agent log
      try {
        final logEntry = {
          'id': 'router_redirect_firebase_not_init_$timestamp',
          'timestamp': DateTime.now().millisecondsSinceEpoch,
          'location': 'app_router.dart:115',
          'message': '[ROUTER] redirect: Firebase not initialized, returning null',
          'data': {'from': state.uri.path},
          'sessionId': 'debug-session',
          'runId': 'run1',
          'hypothesisId': 'A',
        };
        File('/Users/universparty/.cursor/debug.log').writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
      } catch (_) {}
      // #endregion
      return null;
    }

    final user = FirebaseService.auth.currentUser;
    final loc = state.uri.path;

    // #region agent log
    try {
      final logEntry = {
        'id': 'router_redirect_auth_check_$timestamp',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'location': 'app_router.dart:156',
        'message': '[ROUTER] redirect: auth check',
        'data': {
          'from': loc,
          'userIsNull': user == null,
          'userId': user?.uid,
          'userEmail': user?.email != null ? '${user!.email!.substring(0, 2)}***' : null,
        },
        'sessionId': 'debug-session',
        'runId': 'run1',
        'hypothesisId': 'A',
      };
      File('/Users/universparty/.cursor/debug.log').writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
    } catch (_) {}
    // #endregion

    // Only redirect /admin routes for unauthenticated users
    // Other routes use AuthGate widget to show AuthRequiredScreen in-place (no redirect bounce)
    if (loc.startsWith('/admin')) {
      if (user == null) {
        // #region agent log
        try {
          final logEntry = {
            'id': 'router_redirect_admin_unauth_$timestamp',
            'timestamp': DateTime.now().millisecondsSinceEpoch,
            'location': 'app_router.dart:171',
            'message': '[ROUTER] redirect: admin route, user null -> /',
            'data': {'from': loc, 'to': '/'},
            'sessionId': 'debug-session',
            'runId': 'run1',
            'hypothesisId': 'A',
          };
          File('/Users/universparty/.cursor/debug.log').writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
        } catch (_) {}
        // #endregion
        return '/';
      }
      final ok = await _adminService.isCurrentUserAdmin();
      if (!ok) {
        // #region agent log
        try {
          final logEntry = {
            'id': 'router_redirect_admin_denied_$timestamp',
            'timestamp': DateTime.now().millisecondsSinceEpoch,
            'location': 'app_router.dart:318',
            'message': '[ROUTER] redirect: admin access denied -> /home',
            'data': {'from': loc, 'to': '/home'},
            'sessionId': 'debug-session',
            'runId': 'run1',
            'hypothesisId': 'E',
          };
          File('/Users/universparty/.cursor/debug.log').writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
        } catch (_) {}
        // #endregion
        return '/home';
      }
    }

    // No redirect needed for other routes - AuthGate handles auth in-place
    // #region agent log
    try {
      final logEntry = {
        'id': 'router_redirect_no_redirect_$timestamp',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'location': 'app_router.dart:197',
        'message': '[ROUTER] redirect: no redirect needed (AuthGate handles auth)',
        'data': {'from': loc, 'userId': user?.uid, 'isAdminRoute': loc.startsWith('/admin')},
        'sessionId': 'debug-session',
        'runId': 'run1',
        'hypothesisId': 'A',
      };
      File('/Users/universparty/.cursor/debug.log').writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
    } catch (_) {}
    // #endregion

    return null;
  }
}

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    _sub = stream.asBroadcastStream().listen((_) => notifyListeners());
  }
  late final StreamSubscription<dynamic> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

