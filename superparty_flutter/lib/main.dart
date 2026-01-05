import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';
import 'services/firebase_service.dart';
import 'services/background_service.dart';
import 'services/push_notification_service.dart';
import 'services/auto_update_service.dart';
import 'services/force_update_checker_service.dart';
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
import 'widgets/update_dialog.dart';
import 'widgets/force_update_dialog.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    await FirebaseService.initialize();
  } catch (e) {
    print('Firebase init error: $e');
  }
  
  try {
    await BackgroundService.initialize();
  } catch (e) {
    print('Background service init error: $e');
  }
  
  try {
    await PushNotificationService.initialize();
  } catch (e) {
    print('Push notification init error: $e');
  }
  
  runApp(const SuperPartyApp());
}

class SuperPartyApp extends StatelessWidget {
  const SuperPartyApp({super.key});

  @override
  Widget build(BuildContext context) {
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
      home: const AuthWrapper(),
      routes: {
        '/home': (context) => const HomeScreen(),
        '/kyc': (context) => const KycScreen(),
        '/evenimente': (context) => const EvenimenteScreen(),
        '/disponibilitate': (context) => const DisponibilitateScreen(),
        '/salarizare': (context) => const SalarizareScreen(),
        '/centrala': (context) => const CentralaScreen(),
        '/whatsapp': (context) => const WhatsAppScreen(),
        '/team': (context) => const TeamScreen(),
        '/admin': (context) => const AdminScreen(),
        '/admin/kyc': (context) => const KycApprovalsScreen(),
        '/admin/ai-conversations': (context) => const AiConversationsScreen(),
        '/gm/accounts': (context) => const AccountsScreen(),
        '/gm/metrics': (context) => const MetricsScreen(),
        '/gm/analytics': (context) => const AnalyticsScreen(),
        '/gm/staff-setup': (context) => const StaffSetupScreen(),
        '/ai-chat': (context) => const AIChatScreen(),
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
  bool _updateChecked = false;
  bool _showingForceUpdate = false;

  @override
  void initState() {
    super.initState();
    _checkForUpdates();
  }

  Future<void> _checkForUpdates() async {
    try {
      // 1. PRIORITATE: Verifică force update (obligatoriu, blochează app-ul)
      final forceUpdateChecker = ForceUpdateCheckerService();
      final needsForceUpdate = await forceUpdateChecker.needsForceUpdate();
      
      if (!mounted) return;
      
      if (needsForceUpdate) {
        print('[AuthWrapper] ⚠️ Force update required - showing dialog');
        setState(() {
          _showingForceUpdate = true;
        });
        
        // Afișează dialog NON-DISMISSIBLE
        // User-ul NU poate trece mai departe până nu actualizează
        await ForceUpdateDialog.show(context);
        
        // Dialog-ul rămâne deschis până când user-ul instalează update-ul
        // După instalare, app-ul se va reporni cu versiunea nouă
        return;
      }
      
      // 2. Verifică update-uri opționale (sistemul vechi)
      final updateAction = await AutoUpdateService.checkAndApplyUpdate();
      
      if (!mounted) return;
      
      if (updateAction == 'logout') {
        // Versiune nouă disponibilă → deconectează userul
        print('[AutoUpdate] New version detected, logging out user');
        
        // Afișează dialog
        await UpdateDialog.show(
          context,
          forceUpdate: true,
        );
        
        // Deconectează
        await AutoUpdateService.forceLogout();
        
      } else if (updateAction == 'download') {
        // Update pending → afișează dialog de download
        print('[AutoUpdate] Pending update detected, showing download dialog');
        
        await UpdateDialog.show(
          context,
          forceUpdate: true,
        );
        
        // Șterge flag-ul după ce userul a văzut dialog-ul
        await AutoUpdateService.clearPendingUpdate();
      }
      
      setState(() {
        _updateChecked = true;
      });
      
    } catch (e) {
      print('[AuthWrapper] Error checking for updates: $e');
      setState(() {
        _updateChecked = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Dacă se afișează force update dialog, arată loading
    if (_showingForceUpdate) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Verificare actualizări...'),
            ],
          ),
        ),
      );
    }
    
    // Așteaptă verificarea update-urilor
    if (!_updateChecked) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Verificare actualizări...'),
            ],
          ),
        ),
      );
    }
    
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        
        if (snapshot.hasData) {
          BackgroundService.startService().catchError((e) {
            print('Failed to start background service: $e');
          });
          
          // Check user status in Firestore
          return StreamBuilder<DocumentSnapshot>(
            stream: FirebaseFirestore.instance
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
        
        return const LoginScreen();
      },
    );
  }
}
