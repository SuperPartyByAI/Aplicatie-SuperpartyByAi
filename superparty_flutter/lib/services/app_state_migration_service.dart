import 'package:shared_preferences/shared_preferences.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// AppStateMigrationService: Handles data migration between app versions
/// 
/// This service cleans up incompatible cache/state when app version changes,
/// WITHOUT logging out the user (FirebaseAuth session persists).
/// 
/// Use cases:
/// - Clear SQLite cache if schema changed
/// - Reset SharedPreferences flags
/// - Clean up old files
/// - Migrate data structures
class AppStateMigrationService {
  static const String _lastSeenBuildKey = 'last_seen_build_number';

  /// Check if migration is needed and perform it
  /// 
  /// Returns true if migration was performed
  static Future<bool> checkAndMigrate() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final packageInfo = await PackageInfo.fromPlatform();
      
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
      final lastSeenBuild = prefs.getInt(_lastSeenBuildKey) ?? 0;
      
      debugPrint('[AppStateMigration] Current build: $currentBuild, Last seen: $lastSeenBuild');
      
      if (currentBuild > lastSeenBuild) {
        debugPrint('[AppStateMigration] New version detected, running migration...');
        
        await _performMigration(lastSeenBuild, currentBuild, prefs);
        
        // Save current build number
        await prefs.setInt(_lastSeenBuildKey, currentBuild);
        
        debugPrint('[AppStateMigration] Migration complete');
        return true;
      }
      
      debugPrint('[AppStateMigration] No migration needed');
      return false;
      
    } catch (e) {
      debugPrint('[AppStateMigration] Error during migration: $e');
      return false;
    }
  }

  /// Perform actual migration based on version changes
  static Future<void> _performMigration(
    int fromBuild,
    int toBuild,
    SharedPreferences prefs,
  ) async {
    debugPrint('[AppStateMigration] Migrating from build $fromBuild to $toBuild');
    
    // Example migrations (add your own as needed):
    
    // Migration 1→2: Clear old cache flags
    if (fromBuild < 2 && toBuild >= 2) {
      debugPrint('[AppStateMigration] Clearing old cache flags');
      await prefs.remove('old_cache_flag');
      // Add more cleanup as needed
    }
    
    // Migration 2→3: Reset specific preferences
    if (fromBuild < 3 && toBuild >= 3) {
      debugPrint('[AppStateMigration] Resetting specific preferences');
      // Example: await prefs.remove('some_old_setting');
    }
    
    // Add more version-specific migrations here
    
    // General cleanup (runs on every version change)
    await _generalCleanup(prefs);
  }

  /// General cleanup that runs on every version change
  static Future<void> _generalCleanup(SharedPreferences prefs) async {
    debugPrint('[AppStateMigration] Running general cleanup');
    
    // Clear temporary flags
    await prefs.remove('temp_flag');
    
    // Clear old update-related flags (from old AutoUpdateService)
    await prefs.remove('pending_update');
    await prefs.remove('last_update_check');
    
    // Add more general cleanup as needed
    
    // IMPORTANT: DO NOT clear FirebaseAuth session
    // DO NOT call FirebaseAuth.instance.signOut()
  }

  /// Force clear all app state (use with caution)
  /// 
  /// This clears ALL SharedPreferences except auth-related data.
  /// User stays logged in.
  static Future<void> clearAllAppState() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      
      // Get all keys
      final allKeys = prefs.getKeys();
      
      // Keys to preserve (auth-related)
      final preserveKeys = {
        'firebase_auth_token',
        'user_id',
        'user_email',
        // Add more auth-related keys if needed
      };
      
      // Clear all except preserved keys
      for (final key in allKeys) {
        if (!preserveKeys.contains(key)) {
          await prefs.remove(key);
        }
      }
      
      debugPrint('[AppStateMigration] Cleared all app state (preserved auth)');
      
    } catch (e) {
      debugPrint('[AppStateMigration] Error clearing app state: $e');
    }
  }

  /// Get current build number
  static Future<int> getCurrentBuildNumber() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      return int.tryParse(packageInfo.buildNumber) ?? 0;
    } catch (e) {
      debugPrint('[AppStateMigration] Error getting build number: $e');
      return 0;
    }
  }

  /// Get last seen build number
  static Future<int> getLastSeenBuildNumber() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getInt(_lastSeenBuildKey) ?? 0;
    } catch (e) {
      debugPrint('[AppStateMigration] Error getting last seen build: $e');
      return 0;
    }
  }
}
