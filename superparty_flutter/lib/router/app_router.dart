import 'dart:async';

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
import '../screens/team/team_screen.dart';
import '../screens/admin/admin_screen.dart';
import '../screens/admin/kyc_approvals_screen.dart';
import '../screens/admin/ai_conversations_screen.dart';
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

class AppRouter {
  final AdminService _adminService;

  AppRouter({AdminService? adminService}) : _adminService = adminService ?? AdminService();

  late final GoRouter router = GoRouter(
    debugLogDiagnostics: kDebugMode,
    refreshListenable: GoRouterRefreshStream(
      FirebaseService.auth.authStateChanges().timeout(
        const Duration(seconds: 5),
        onTimeout: (sink) {
          debugPrint('[AppRouter] ⚠️ Auth stream timeout (5s) - emulator may be down');
          // Don't add error - just let it complete naturally
        },
      ),
    ),
    redirect: _redirect,
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const AuthWrapper(),
      ),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/kyc', builder: (_, __) => const KycScreen()),
      GoRoute(path: '/evenimente', builder: (_, __) => const EvenimenteScreen()),
      GoRoute(path: '/disponibilitate', builder: (_, __) => const DisponibilitateScreen()),
      GoRoute(path: '/salarizare', builder: (_, __) => const SalarizareScreen()),
      GoRoute(path: '/centrala', builder: (_, __) => const CentralaScreen()),
      GoRoute(
        path: '/whatsapp',
        builder: (_, __) => const WhatsAppScreen(),
        routes: [
          GoRoute(
            path: 'accounts',
            builder: (_, __) => const WhatsAppAccountsScreen(),
          ),
        ],
      ),
      GoRoute(path: '/team', builder: (_, __) => const TeamScreen()),
      GoRoute(path: '/ai-chat', builder: (_, __) => const AIChatScreen()),

      // Staff self-setup (new, secure via callables)
      GoRoute(path: '/staff-settings', builder: (_, __) => const StaffSettingsScreen()),

      // Admin (new)
      GoRoute(
        path: '/admin',
        builder: (_, __) => const AdminDashboardScreen(),
        routes: [
          GoRoute(
            path: 'user/:uid',
            builder: (context, state) {
              final uid = state.pathParameters['uid'];
              // Safe redirect: if uid is missing or empty, show NotFoundScreen
              if (uid == null || uid.isEmpty) {
                return NotFoundScreen(routeName: state.uri.toString());
              }
              return AdminUserDetailScreen(uid: uid);
            },
          ),

          // Legacy admin tools (existing screens)
          GoRoute(path: 'legacy', builder: (_, __) => const AdminScreen()),
          GoRoute(path: 'kyc', builder: (_, __) => const KycApprovalsScreen()),
          GoRoute(path: 'ai-conversations', builder: (_, __) => const AiConversationsScreen()),
        ],
      ),

      // GM screens (existing)
      GoRoute(path: '/gm/accounts', builder: (_, __) => const AccountsScreen()),
      GoRoute(path: '/gm/metrics', builder: (_, __) => const MetricsScreen()),
      GoRoute(path: '/gm/analytics', builder: (_, __) => const AnalyticsScreen()),
      GoRoute(path: '/gm/staff-setup', builder: (_, __) => const StaffSetupScreen()),
    ],
    errorBuilder: (context, state) => NotFoundScreen(routeName: state.uri.toString()),
  );

  FutureOr<String?> _redirect(BuildContext context, GoRouterState state) async {
    // Wait for Firebase init (main shows a loading MaterialApp until then).
    if (!FirebaseService.isInitialized) return null;

    final user = FirebaseService.auth.currentUser;
    final loc = state.uri.path;

    final isPublic = loc == '/';
    if (user == null) {
      return isPublic ? null : '/';
    }

    // Authenticated: keep '/' as-is (AuthWrapper decides), but gate admin routes.
    if (loc.startsWith('/admin')) {
      final ok = await _adminService.isCurrentUserAdmin();
      if (!ok) return '/home';
    }

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

