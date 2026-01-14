import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../models/app_version_config.dart';

/// Service pentru verificare force update
/// 
/// Integrare cu AutoUpdateService existent, dar cu logică simplificată:
/// - citește config din Firestore
/// - compară build-ul local cu min_build_number
/// - returnează dacă e nevoie de force update
class ForceUpdateCheckerService {
  final FirebaseFirestore _firestore;

  ForceUpdateCheckerService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Citește configurația de versiune din Firestore
  /// 
  /// FAIL-SAFE: Returns safe default config if Firestore is unavailable.
  /// Never throws - always returns a valid config.
  Future<AppVersionConfig> getVersionConfig() async {
    try {
      print('[ForceUpdateChecker] Reading from Firestore: app_config/version');
      
      final doc = await _firestore
          .collection('app_config')
          .doc('version')
          .get()
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () {
              print('[ForceUpdateChecker] ⚠️ Firestore read timeout (10s)');
              throw TimeoutException('Firestore read timeout');
            },
          );

      print('[ForceUpdateChecker] Document exists: ${doc.exists}');

      if (!doc.exists) {
        print('[ForceUpdateChecker] ⚠️ No version config in Firestore');
        print('[ForceUpdateChecker] ℹ️ Using safe default (force_update=false)');
        return AppVersionConfig.safeDefault();
      }

      final data = doc.data();
      if (data == null || data.isEmpty) {
        print('[ForceUpdateChecker] ⚠️ Version config data is null or empty');
        print('[ForceUpdateChecker] ℹ️ Using safe default (force_update=false)');
        return AppVersionConfig.safeDefault();
      }

      print('[ForceUpdateChecker] ✅ Config data: $data');
      
      // fromFirestore now handles missing fields gracefully
      final config = AppVersionConfig.fromFirestore(data);
      
      print('[ForceUpdateChecker] Parsed config:');
      print('[ForceUpdateChecker]   - min_version: ${config.minVersion}');
      print('[ForceUpdateChecker]   - min_build_number: ${config.minBuildNumber}');
      print('[ForceUpdateChecker]   - force_update: ${config.forceUpdate}');
      print('[ForceUpdateChecker]   - android_download_url: ${config.androidDownloadUrl}');
      
      return config;
    } on TimeoutException catch (e) {
      print('[ForceUpdateChecker] ⚠️ Firestore timeout: $e');
      print('[ForceUpdateChecker] ℹ️ App will continue without force update check');
      return AppVersionConfig.safeDefault();
    } on FirebaseException catch (e) {
      print('[ForceUpdateChecker] ⚠️ Firebase error: ${e.code} - ${e.message}');
      print('[ForceUpdateChecker] ℹ️ Common causes:');
      print('[ForceUpdateChecker]    - Firestore not initialized');
      print('[ForceUpdateChecker]    - No internet connection');
      print('[ForceUpdateChecker]    - Firestore rules blocking read');
      print('[ForceUpdateChecker] ℹ️ App will continue without force update check');
      return AppVersionConfig.safeDefault();
    } catch (e, stackTrace) {
      print('[ForceUpdateChecker] ❌ Unexpected error reading version config: $e');
      print('[ForceUpdateChecker] Stack trace: $stackTrace');
      print('[ForceUpdateChecker] ℹ️ App will continue without force update check');
      return AppVersionConfig.safeDefault();
    }
  }

  /// Verifică dacă aplicația necesită force update
  /// 
  /// FAIL-SAFE: Returns false if check fails (never blocks app on error).
  /// Returns true only if:
  /// - force_update = true în Firestore
  /// - build-ul local < min_build_number
  Future<bool> needsForceUpdate() async {
    try {
      // Check if Firebase is initialized
      if (Firebase.apps.isEmpty) {
        print('[ForceUpdateChecker] ⚠️ Firebase not initialized');
        print('[ForceUpdateChecker] ℹ️ Skipping force update check');
        return false;
      }

      final config = await getVersionConfig();
      
      // getVersionConfig now always returns a valid config (never null)
      // If it's a safe default, force_update will be false
      
      // Verifică dacă force_update e activat
      if (!config.forceUpdate) {
        print('[ForceUpdateChecker] Force update disabled in config');
        return false;
      }

      // Obține build-ul curent
      final packageInfo = await PackageInfo.fromPlatform();
      final currentBuildNumber = int.tryParse(packageInfo.buildNumber) ?? 0;

      print('[ForceUpdateChecker] Current build: $currentBuildNumber');
      print('[ForceUpdateChecker] Min required build: ${config.minBuildNumber}');

      // Compară build numbers
      final needsUpdate = currentBuildNumber < config.minBuildNumber;

      if (needsUpdate) {
        print('[ForceUpdateChecker] ⚠️ Force update required!');
        print('[ForceUpdateChecker] ℹ️ Current: $currentBuildNumber, Required: ${config.minBuildNumber}');
      } else {
        print('[ForceUpdateChecker] ✅ App is up to date');
      }

      return needsUpdate;
    } catch (e, stackTrace) {
      print('[ForceUpdateChecker] ❌ Error checking for update: $e');
      print('[ForceUpdateChecker] Stack trace: $stackTrace');
      print('[ForceUpdateChecker] ℹ️ FAIL-SAFE: App will continue without blocking');
      // Fail-safe: nu blocăm app-ul dacă verificarea eșuează
      return false;
    }
  }

  /// Obține URL-ul de download pentru platforma curentă
  /// 
  /// FAIL-SAFE: Returns null if config unavailable or no URL for platform
  Future<String?> getDownloadUrl() async {
    try {
      final config = await getVersionConfig();
      
      // Web doesn't support direct APK/IPA downloads
      if (kIsWeb) {
        print('[ForceUpdateChecker] ℹ️ Download not supported on web');
        return null;
      }
      
      // Use defaultTargetPlatform instead of Platform (works on all platforms)
      switch (defaultTargetPlatform) {
        case TargetPlatform.android:
          return config.androidDownloadUrl;
        case TargetPlatform.iOS:
          return config.iosDownloadUrl;
        default:
          return null;
      }
    } catch (e) {
      print('[ForceUpdateChecker] ❌ Error getting download URL: $e');
      return null;
    }
  }

  /// Obține mesajul de update
  /// 
  /// FAIL-SAFE: Always returns a valid message
  Future<String> getUpdateMessage() async {
    try {
      final config = await getVersionConfig();
      return config.updateMessage;
    } catch (e) {
      print('[ForceUpdateChecker] ❌ Error getting update message: $e');
      return 'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.';
    }
  }

  /// Obține release notes
  /// 
  /// FAIL-SAFE: Always returns a valid string (empty if unavailable)
  Future<String> getReleaseNotes() async {
    try {
      final config = await getVersionConfig();
      return config.releaseNotes;
    } catch (e) {
      print('[ForceUpdateChecker] ❌ Error getting release notes: $e');
      return '';
    }
  }
}
