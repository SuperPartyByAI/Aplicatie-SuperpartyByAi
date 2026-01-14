/// App Router - Routing declarativ cu go_router
/// 
/// Migrează routing-ul monolitic din main.dart într-un router declarativ.
/// Păstrează compatibilitate cu rutele vechi (/#/evenimente, deep links).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../screens/auth/login_screen.dart';
import '../../../screens/home/home_screen.dart';
import '../../../screens/kyc/kyc_screen.dart';
import '../../../screens/evenimente/evenimente_screen.dart';
import '../../../screens/disponibilitate/disponibilitate_screen.dart';
import '../../../screens/salarizare/salarizare_screen.dart';
import '../../../screens/centrala/centrala_screen.dart';
import '../../../screens/whatsapp/whatsapp_screen.dart';
import '../../../screens/team/team_screen.dart';
import '../../../screens/admin/admin_screen.dart';
import '../../../screens/admin/kyc_approvals_screen.dart';
import '../../../screens/admin/ai_conversations_screen.dart';
import '../../../screens/gm/accounts_screen.dart';
import '../../../screens/gm/metrics_screen.dart';
import '../../../screens/gm/analytics_screen.dart';
import '../../../screens/gm/staff_setup_screen.dart';
import '../../../screens/ai_chat/ai_chat_screen.dart';
import '../../../screens/error/not_found_screen.dart';
import '../../../main.dart'; // Import AuthWrapper pentru moment
import '../../di/injector.dart';
import '../../di/interfaces.dart';

/// Creează router-ul aplicației
/// 
/// Migrare incrementală: păstrează AuthWrapper pentru ruta "/" până când
/// DI e complet migrat și logica poate fi mutată în guards.
GoRouter createAppRouter() {
  return GoRouter(
    // Normalizează rutele (/#/evenimente -> /evenimente)
    redirect: (context, state) {
      final location = state.uri.toString();
      if (location.startsWith('/#/')) {
        final normalized = location.substring(2); // Remove /#
        return normalized;
      }
      return null; // No redirect needed
    },
    routes: [
      // Root - folosește AuthWrapper existent (migrare incrementală)
      GoRoute(
        path: '/',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Home
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomeScreen(),
      ),
      
      // KYC
      GoRoute(
        path: '/kyc',
        builder: (context, state) => const KycScreen(),
      ),
      
      // Evenimente
      GoRoute(
        path: '/evenimente',
        builder: (context, state) => const EvenimenteScreen(),
      ),
      
      // Disponibilitate
      GoRoute(
        path: '/disponibilitate',
        builder: (context, state) => const DisponibilitateScreen(),
      ),
      
      // Salarizare
      GoRoute(
        path: '/salarizare',
        builder: (context, state) => const SalarizareScreen(),
      ),
      
      // Centrala
      GoRoute(
        path: '/centrala',
        builder: (context, state) => const CentralaScreen(),
      ),
      
      // WhatsApp
      GoRoute(
        path: '/whatsapp',
        builder: (context, state) => const WhatsAppScreen(),
      ),
      
      // Team
      GoRoute(
        path: '/team',
        builder: (context, state) => const TeamScreen(),
      ),
      
      // Admin routes
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminScreen(),
      ),
      GoRoute(
        path: '/admin/kyc',
        builder: (context, state) => const KycApprovalsScreen(),
      ),
      GoRoute(
        path: '/admin/ai-conversations',
        builder: (context, state) => const AiConversationsScreen(),
      ),
      
      // GM routes
      GoRoute(
        path: '/gm/accounts',
        builder: (context, state) => const AccountsScreen(),
      ),
      GoRoute(
        path: '/gm/metrics',
        builder: (context, state) => const MetricsScreen(),
      ),
      GoRoute(
        path: '/gm/analytics',
        builder: (context, state) => const AnalyticsScreen(),
      ),
      GoRoute(
        path: '/gm/staff-setup',
        builder: (context, state) => const StaffSetupScreen(),
      ),
      
      // AI Chat
      GoRoute(
        path: '/ai-chat',
        builder: (context, state) => const AIChatScreen(),
      ),
    ],
    errorBuilder: (context, state) => NotFoundScreen(routeName: state.uri.toString()),
  );
}
