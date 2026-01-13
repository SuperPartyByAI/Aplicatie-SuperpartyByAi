import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:io';
import 'firebase_service.dart';

/// Service pentru auto-update cu deconectare forțată
/// 
/// Flow:
/// 1. La deschidere app → verifică versiune în Firestore
/// 2. Dacă versiune nouă → deconectează user + salvează flag
/// 3. La următoarea deschidere → descarcă update automat
/// 4. User se loghează din nou cu versiunea nouă
class AutoUpdateService {
  static const String _updateFlagKey = 'pending_update';
  static const String _lastVersionKey = 'last_checked_version';
  
  /// Verifică dacă există actualizări disponibile
  /// Returnează true dacă trebuie să deconecteze userul
  static Future<bool> checkForUpdates() async {
    try {
      // 1. Obține versiunea curentă din app
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version;
      final currentBuildNumber = int.parse(packageInfo.buildNumber);
      
      print('[AutoUpdate] Current version: $currentVersion ($currentBuildNumber)');
      
      // 2. Obține versiunea minimă din Firestore
      final doc = await FirebaseService.firestore
          .collection('app_config')
          .doc('version')
          .get();
      
      if (!doc.exists) {
        print('[AutoUpdate] No version config in Firestore');
        return false;
      }
      
      final data = doc.data();
      if (data == null) {
        print('[AutoUpdate] Invalid data');
        return false;
      }
      final minVersion = data['min_version'] as String?;
      final minBuildNumber = data['min_build_number'] as int?;
      final forceUpdate = data['force_update'] as bool? ?? false;
      
      print('[AutoUpdate] Min version: $minVersion ($minBuildNumber)');
      print('[AutoUpdate] Force update: $forceUpdate');
      
      // 3. Verifică dacă versiunea curentă e mai veche
      if (minBuildNumber != null && currentBuildNumber < minBuildNumber) {
        print('[AutoUpdate] Update required! Current: $currentBuildNumber < Min: $minBuildNumber');
        
        // Salvează flag pentru update
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool(_updateFlagKey, true);
        await prefs.setString(_lastVersionKey, minVersion ?? '');
        
        // Returnează true pentru a declanșa deconectarea
        return true;
      }
      
      print('[AutoUpdate] App is up to date');
      return false;
      
    } catch (e) {
      print('[AutoUpdate] Error checking updates: $e');
      return false;
    }
  }
  
  /// Verifică dacă există un update pending (flag setat)
  static Future<bool> hasPendingUpdate() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_updateFlagKey) ?? false;
    } catch (e) {
      print('[AutoUpdate] Error checking pending update: $e');
      return false;
    }
  }
  
  /// Șterge flag-ul de update pending (după ce s-a descărcat)
  static Future<void> clearPendingUpdate() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_updateFlagKey);
      print('[AutoUpdate] Cleared pending update flag');
    } catch (e) {
      print('[AutoUpdate] Error clearing pending update: $e');
    }
  }
  
  /// DEPRECATED: No longer logs out user for updates
  /// User stays authenticated through update process
  @Deprecated('Force Update no longer requires logout')
  static Future<void> forceLogout() async {
    print('[AutoUpdate] forceLogout() called but deprecated - user stays authenticated');
    // DO NOT sign out - user should remain authenticated through update
  }
  
  /// Obține mesajul de update din Firestore
  static Future<String> getUpdateMessage() async {
    try {
      final doc = await FirebaseService.firestore
          .collection('app_config')
          .doc('version')
          .get();
      
      if (!doc.exists) {
        return 'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.';
      }
      
      final data = doc.data();
      if (data == null) {
        print('[AutoUpdate] Invalid data');
        return 'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.';
      }
      return data['update_message'] as String? ?? 
          'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.';
    } catch (e) {
      print('[AutoUpdate] Error getting update message: $e');
      return 'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.';
    }
  }
  
  /// Obține URL-ul de download pentru platforma curentă
  static Future<String?> getDownloadUrl() async {
    try {
      final doc = await FirebaseService.firestore
          .collection('app_config')
          .doc('version')
          .get();
      
      if (!doc.exists) {
        return null;
      }
      
      final data = doc.data();
      if (data == null) {
        print('[AutoUpdate] Invalid data');
        return null;
      }
      
      // Returnează URL-ul în funcție de platformă
      if (Platform.isAndroid) {
        return data['android_download_url'] as String?;
      } else if (Platform.isIOS) {
        return data['ios_download_url'] as String?;
      }
      
      return null;
    } catch (e) {
      print('[AutoUpdate] Error getting download URL: $e');
      return null;
    }
  }
  
  /// Verifică și aplică update-ul (flow complet)
  /// DEPRECATED: Use ForceUpdateCheckerService instead
  /// 
  /// This old system is kept for backward compatibility but should not be used.
  /// The new ForceUpdateCheckerService handles updates without logging out users.
  /// 
  /// Returnează:
  /// - null: nu e nevoie de update
  /// - 'update_available': există update disponibil (fără logout)
  @Deprecated('Use ForceUpdateCheckerService instead')
  static Future<String?> checkAndApplyUpdate() async {
    try {
      // 1. Verifică dacă există update pending (flag setat anterior)
      final hasPending = await hasPendingUpdate();
      
      if (hasPending) {
        print('[AutoUpdate] Pending update detected');
        return 'update_available';
      }
      
      // 2. Verifică dacă există versiune nouă în Firestore
      final needsUpdate = await checkForUpdates();
      
      if (needsUpdate) {
        print('[AutoUpdate] New version available (no logout required)');
        return 'update_available';
      }
      
      // 3. Nu e nevoie de update
      return null;
      
    } catch (e) {
      print('[AutoUpdate] Error in checkAndApplyUpdate: $e');
      return null;
    }
  }
  
  /// Inițializează configurația de versiune în Firestore (doar pentru admin)
  /// 
  /// Exemplu:
  /// ```dart
  /// await AutoUpdateService.initializeVersionConfig(
  ///   minVersion: '1.0.1',
  ///   minBuildNumber: 2,
  ///   forceUpdate: true,
  ///   updateMessage: 'Versiune nouă disponibilă cu bug fixes!',
  ///   androidDownloadUrl: 'https://example.com/app-release.apk',
  ///   iosDownloadUrl: 'https://apps.apple.com/app/superparty/id123456789',
  /// );
  /// ```
  static Future<void> initializeVersionConfig({
    required String minVersion,
    required int minBuildNumber,
    bool forceUpdate = false,
    String? updateMessage,
    String? androidDownloadUrl,
    String? iosDownloadUrl,
  }) async {
    try {
      await FirebaseService.firestore
          .collection('app_config')
          .doc('version')
          .set({
        'min_version': minVersion,
        'min_build_number': minBuildNumber,
        'force_update': forceUpdate,
        'update_message': updateMessage ?? 
            'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.',
        'android_download_url': androidDownloadUrl,
        'ios_download_url': iosDownloadUrl,
        'updated_at': FieldValue.serverTimestamp(),
      });
      
      print('[AutoUpdate] Version config initialized: $minVersion ($minBuildNumber)');
    } catch (e) {
      print('[AutoUpdate] Error initializing version config: $e');
      rethrow;
    }
  }
}
