import 'package:flutter/material.dart';

import '../screens/admin/admin_screen.dart';
import '../screens/admin/ai_conversations_screen.dart';
import '../screens/admin/ai_event_override_screen.dart';
import '../screens/admin/ai_logic_global_screen.dart';
import '../screens/admin/ai_sessions_screen.dart';
import '../screens/admin/firestore_migration_screen.dart';
import '../screens/admin/kyc_approvals_screen.dart';
import '../screens/ai_chat/ai_chat_screen.dart';
import '../screens/centrala/centrala_screen.dart';
import '../screens/disponibilitate/disponibilitate_screen.dart';
import '../screens/evenimente/evenimente_screen.dart';
import '../screens/error/not_found_screen.dart';
import '../screens/gm/accounts_screen.dart';
import '../screens/gm/analytics_screen.dart';
import '../screens/gm/metrics_screen.dart';
import '../screens/gm/staff_setup_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/kyc/kyc_screen.dart';
import '../screens/salarizare/salarizare_screen.dart';
import '../screens/team/team_screen.dart';
import '../screens/whatsapp/whatsapp_screen.dart';

Route<dynamic> onGenerateRoute(RouteSettings settings) {
  debugPrint('[ROUTE] Raw: ${settings.name}');

  // Normalize route: handle /#/evenimente, query params, trailing slash
  final raw = settings.name ?? '/';
  final cleaned = raw.startsWith('/#') ? raw.substring(2) : raw; // "/#/x" -> "/x"
  final uri = Uri.tryParse(cleaned) ?? Uri(path: cleaned);
  var path = uri.path.isEmpty ? '/' : uri.path;

  // Normalize trailing slashes (except root).
  if (path.length > 1 && path.endsWith('/')) {
    path = path.replaceAll(RegExp(r'/+$'), '');
  }

  debugPrint('[ROUTE] Normalized: $path');

  Widget page;
  switch (path) {
    case '/':
    case '/home':
      page = const HomeScreen();
      break;
    case '/kyc':
      page = const KycScreen();
      break;
    case '/evenimente':
      page = const EvenimenteScreen();
      break;
    case '/disponibilitate':
      page = const DisponibilitateScreen();
      break;
    case '/salarizare':
      page = const SalarizareScreen();
      break;
    case '/centrala':
      page = const CentralaScreen();
      break;
    case '/whatsapp':
      page = const WhatsAppScreen();
      break;
    case '/team':
      page = const TeamScreen();
      break;
    case '/admin':
      page = const AdminScreen();
      break;
    case '/admin/kyc':
      page = const KycApprovalsScreen();
      break;
    case '/admin/ai-conversations':
      page = const AiConversationsScreen();
      break;
    case '/admin/ai-logic':
      page = const AiLogicGlobalScreen();
      break;
    case '/admin/ai-sessions':
      final args = settings.arguments;
      final eventId = (args is Map) ? args['eventId']?.toString() : null;
      page = AiSessionsScreen(eventId: eventId);
      break;
    case '/admin/ai-override':
      final args = settings.arguments;
      final eventId = (args is Map) ? args['eventId']?.toString() : null;
      page = eventId == null
          ? const NotFoundScreen(routeName: '/admin/ai-override (missing eventId)')
          : AiEventOverrideScreen(eventId: eventId);
      break;
    case '/admin/firestore-migration':
      page = const FirestoreMigrationScreen();
      break;
    // Backwards-compatible alias (underscore).
    case '/admin/firestore_migration':
      page = const FirestoreMigrationScreen();
      break;
    case '/gm/accounts':
      page = const AccountsScreen();
      break;
    case '/gm/metrics':
      page = const MetricsScreen();
      break;
    case '/gm/analytics':
      page = const AnalyticsScreen();
      break;
    case '/gm/staff-setup':
      page = const StaffSetupScreen();
      break;
    case '/ai-chat':
      final args = settings.arguments;
      String? eventId;
      String? initialText;
      if (args is Map) {
        eventId = args['eventId']?.toString();
        initialText = args['initialText']?.toString();
      }
      page = AIChatScreen(eventId: eventId, initialText: initialText);
      break;
    default:
      debugPrint('[ROUTE] Unknown path: $path - showing NotFoundScreen');
      page = NotFoundScreen(routeName: path);
      break;
  }

  return MaterialPageRoute(
    settings: settings,
    builder: (_) => page,
  );
}

Route<dynamic> onUnknownRoute(RouteSettings settings) {
  debugPrint('[ROUTE] onUnknownRoute called for: ${settings.name}');
  return MaterialPageRoute(
    settings: settings,
    builder: (_) => NotFoundScreen(routeName: settings.name),
  );
}

