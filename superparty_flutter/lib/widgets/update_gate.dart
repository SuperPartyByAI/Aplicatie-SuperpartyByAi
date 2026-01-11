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
      debugPrint('[UpdateGate] ========================================');
      debugPrint('[UpdateGate] Starting force update check...');
      
      final checker = ForceUpdateCheckerService();
      
      // Get current build info
      final packageInfo = await PackageInfo.fromPlatform();
      debugPrint('[UpdateGate] Current app version: ${packageInfo.version}');
      debugPrint('[UpdateGate] Current build number: ${packageInfo.buildNumber}');
      
      final needsUpdate = await checker.needsForceUpdate();
      
      debugPrint('[UpdateGate] Force update required: $needsUpdate');
      debugPrint('[UpdateGate] ========================================');
      
      // If no update needed, check for data migration
      if (!needsUpdate) {
        debugPrint('[UpdateGate] No force update needed, checking for data migration...');
        try {
          await AppStateMigrationService.checkAndMigrate();
        } catch (e) {
          debugPrint('[UpdateGate] ⚠️ Data migration failed (non-critical): $e');
          // Continue anyway - migration failure shouldn't block app
        }
      }
      
      if (mounted) {
        setState(() {
          _needsUpdate = needsUpdate;
          _checking = false;
        });
      }
    } catch (e, stackTrace) {
      debugPrint('[UpdateGate] ❌ Error checking for update: $e');
      debugPrint('[UpdateGate] Stack trace: $stackTrace');
      debugPrint('[UpdateGate] ℹ️ FAIL-SAFE: App will continue without blocking');
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
    // Always return child (main app) with overlay on top
    // This preserves routing and prevents MaterialApp nesting
    return Stack(
      children: [
        // Main app (always present)
        widget.child,
        
        // Overlay for checking state
        if (_checking)
          Positioned.fill(
            child: Material(
              color: Colors.white,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [
                    CircularProgressIndicator(),
                    SizedBox(height: 16),
                    Text('Verificare actualizări...'),
                  ],
                ),
              ),
            ),
          ),
        
        // Overlay for force update screen
        if (_needsUpdate)
          Positioned.fill(
            child: Material(
              color: Colors.white,
              child: ForceUpdateScreen(
                onUpdateComplete: () {
                  // After update is installed and app restarts,
                  // this callback won't be called because app will restart.
                  // But we keep it for potential future use.
                  debugPrint('[UpdateGate] Update complete callback (app should restart)');
                },
              ),
            ),
          ),
      ],
    );
  }
}
