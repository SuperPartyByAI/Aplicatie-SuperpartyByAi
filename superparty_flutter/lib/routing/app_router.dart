import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import '../screens/home/home_screen.dart';
import '../screens/kyc/kyc_screen.dart';
import '../screens/evenimente/evenimente_screen.dart';
import '../screens/disponibilitate/disponibilitate_screen.dart';
import '../screens/salarizare/salarizare_screen.dart';
import '../screens/centrala/centrala_screen.dart';
import '../screens/whatsapp/whatsapp_screen.dart';
import '../screens/team/team_screen.dart';
import '../screens/admin/admin_screen.dart';
import '../screens/admin/kyc_approvals_screen.dart';
import '../screens/admin/ai_conversations_screen.dart';
import '../screens/admin/firestore_migration_screen.dart';
import '../screens/gm/accounts_screen.dart';
import '../screens/gm/metrics_screen.dart';
import '../screens/gm/analytics_screen.dart';
import '../screens/gm/staff_setup_screen.dart';
import '../screens/ai_chat/ai_chat_screen.dart';
import 'unknown_route_page.dart';

/// Generate routes for the app
/// Preserves route settings (name + arguments) for all routes
Route<dynamic> onGenerateRoute(RouteSettings settings) {
  if (kDebugMode) {
    debugPrint('[ROUTE] Raw: ${settings.name}');
  }
  
  // Normalize route: handle /#/evenimente, query params, trailing slash
  final raw = settings.name ?? '/';
  final cleaned = raw.startsWith('/#') ? raw.substring(2) : raw; // "/#/x" -> "/x"
  final uri = Uri.tryParse(cleaned) ?? Uri(path: cleaned);
  final path = uri.path.isEmpty ? '/' : uri.path;
  
  if (kDebugMode) {
    debugPrint('[ROUTE] Normalized: $path');
  }
  
  // Handle all routes including deep-links
  switch (path) {
    case '/home':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const HomeScreen(),
      );
    case '/kyc':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const KycScreen(),
      );
    case '/evenimente':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const EvenimenteScreen(),
      );
    case '/disponibilitate':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const DisponibilitateScreen(),
      );
    case '/salarizare':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const SalarizareScreen(),
      );
    case '/centrala':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const CentralaScreen(),
      );
    case '/whatsapp':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const WhatsAppScreen(),
      );
    case '/team':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const TeamScreen(),
      );
    case '/admin':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AdminScreen(),
      );
    case '/admin/kyc':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const KycApprovalsScreen(),
      );
    case '/admin/ai-conversations':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AiConversationsScreen(),
      );
    case '/admin/firestore-migration':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const FirestoreMigrationScreen(),
      );
    case '/gm/accounts':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AccountsScreen(),
      );
    case '/gm/metrics':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const MetricsScreen(),
      );
    case '/gm/analytics':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AnalyticsScreen(),
      );
    case '/gm/staff-setup':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const StaffSetupScreen(),
      );
    case '/ai-chat':
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AIChatScreen(),
      );
    default:
      if (kDebugMode) {
        debugPrint('[ROUTE] Unknown path: $path - showing UnknownRoutePage');
      }
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => UnknownRoutePage(routeName: path),
      );
  }
}
