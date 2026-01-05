import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../services/force_update_checker_service.dart';
import '../services/app_state_migration_service.dart';
import '../screens/update/force_update_screen.dart';

/// UpdateGate: Single point of control for Force Update flow
/// 
/// This widget sits at the root of the app and decides whether to:
/// - Show ForceUpdateScreen (if update is required)
/// - Show the normal app (if no update needed)
/// 
/// IMPORTANT: User stays authenticated through the update process.
/// No signOut() is called - FirebaseAuth session persists.
class UpdateGate extends StatefulWidget {
  final Widget child;

  const UpdateGate({
    super.key,
    required this.child,
  });

  @override
  State<UpdateGate> createState() => _UpdateGateState();
}

class _UpdateGateState extends State<UpdateGate> {
  bool _checking = true;
  bool _needsUpdate = false;

  @override
  void initState() {
    super.initState();
    _checkForUpdate();
  }

  Future<void> _checkForUpdate() async {
    try {
      print('[UpdateGate] ========================================');
      print('[UpdateGate] Starting force update check...');
      
      final checker = ForceUpdateCheckerService();
      
      // Get current build info
      final packageInfo = await PackageInfo.fromPlatform();
      print('[UpdateGate] Current app version: ${packageInfo.version}');
      print('[UpdateGate] Current build number: ${packageInfo.buildNumber}');
      
      final needsUpdate = await checker.needsForceUpdate();
      
      print('[UpdateGate] Force update required: $needsUpdate');
      print('[UpdateGate] ========================================');
      
      // If no update needed, check for data migration
      if (!needsUpdate) {
        print('[UpdateGate] No force update needed, checking for data migration...');
        await AppStateMigrationService.checkAndMigrate();
      }
      
      if (mounted) {
        setState(() {
          _needsUpdate = needsUpdate;
          _checking = false;
        });
      }
    } catch (e) {
      print('[UpdateGate] Error checking for update: $e');
      // Fail-safe: don't block app if check fails
      if (mounted) {
        setState(() {
          _needsUpdate = false;
          _checking = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Show loading while checking
    if (_checking) {
      return const MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
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
        ),
      );
    }

    // Show ForceUpdateScreen if update is required
    if (_needsUpdate) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        home: ForceUpdateScreen(
          onUpdateComplete: () {
            // After update is installed and app restarts,
            // this callback won't be called because app will restart.
            // But we keep it for potential future use.
            print('[UpdateGate] Update complete callback (app should restart)');
          },
        ),
      );
    }

    // No update needed - show normal app
    return widget.child;
  }
}
