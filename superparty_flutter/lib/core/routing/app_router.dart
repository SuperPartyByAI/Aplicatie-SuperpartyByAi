library app_router;

/// App Router - Routing declarativ cu go_router
/// 
/// MigreazÄƒ routing-ul monolitic din main.dart Ã®ntr-un router declarativ.
/// PÄƒstreazÄƒ compatibilitate cu rutele vechi (/#/evenimente, deep links).

import 'package:go_router/go_router.dart';
import 'package:superparty_app/core/routing/auth_wrapper.dart';
import '../../../screens/error/not_found_screen.dart';
/// CreeazÄƒ router-ul aplicaÈ›iei
/// 
/// Migrare incrementalÄƒ: pÄƒstreazÄƒ AuthWrapper pentru ruta "/" pÃ¢nÄƒ cÃ¢nd
/// DI e complet migrat È™i logica poate fi mutatÄƒ Ã®n guards.
GoRouter createAppRouter() {
  return GoRouter(
    // NormalizeazÄƒ rutele (/#/evenimente -> /evenimente)
    redirect: (context, state) {
      final location = state.uri.toString();
      if (location.startsWith('/#/')) {
        final normalized = location.substring(2); // Remove /#
        return normalized;
      }
      return null; // No redirect needed
    },
    routes: [
      // Root - foloseÈ™te AuthWrapper existent (migrare incrementalÄƒ)
      GoRoute(
        path: '/',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Home
      GoRoute(
        path: '/home',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // KYC
      GoRoute(
        path: '/kyc',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Evenimente
      GoRoute(
        path: '/evenimente',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Disponibilitate
      GoRoute(
        path: '/disponibilitate',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Salarizare
      GoRoute(
        path: '/salarizare',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Centrala
      GoRoute(
        path: '/centrala',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // WhatsApp
      GoRoute(
        path: '/whatsapp',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Team
      GoRoute(
        path: '/team',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // Admin routes
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AuthWrapper(),
      ),
      GoRoute(
        path: '/admin/kyc',
        builder: (context, state) => const AuthWrapper(),
      ),
      GoRoute(
        path: '/admin/ai-conversations',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // GM routes
      GoRoute(
        path: '/gm/accounts',
        builder: (context, state) => const AuthWrapper(),
      ),
      GoRoute(
        path: '/gm/metrics',
        builder: (context, state) => const AuthWrapper(),
      ),
      GoRoute(
        path: '/gm/analytics',
        builder: (context, state) => const AuthWrapper(),
      ),
      GoRoute(
        path: '/gm/staff-setup',
        builder: (context, state) => const AuthWrapper(),
      ),
      
      // AI Chat
      GoRoute(
        path: '/ai-chat',
        builder: (context, state) => const AuthWrapper(),
      ),
    ],
    errorBuilder: (context, state) => NotFoundScreen(routeName: state.uri.toString()),
  );
}




