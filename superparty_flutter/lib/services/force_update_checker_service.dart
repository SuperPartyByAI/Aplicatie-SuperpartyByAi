import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
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
  /// Returns null dacă documentul nu există sau parsing eșuează
  Future<AppVersionConfig?> getVersionConfig() async {
    try {
      print('[ForceUpdateChecker] Reading from Firestore: app_config/version');
      
      final doc = await _firestore
          .collection('app_config')
          .doc('version')
          .get();

      print('[ForceUpdateChecker] Document exists: ${doc.exists}');

      if (!doc.exists) {
        print('[ForceUpdateChecker] ❌ No version config in Firestore');
        return null;
      }

      final data = doc.data();
      if (data == null) {
        print('[ForceUpdateChecker] ❌ Version config data is null');
        return null;
      }

      print('[ForceUpdateChecker] ✅ Config data: $data');
      
      final config = AppVersionConfig.fromFirestore(data);
      print('[ForceUpdateChecker] Parsed config:');
      print('[ForceUpdateChecker]   - min_build_number: ${config.minBuildNumber}');
      print('[ForceUpdateChecker]   - force_update: ${config.forceUpdate}');
      print('[ForceUpdateChecker]   - android_download_url: ${config.androidDownloadUrl}');
      
      return config;
    } catch (e, stackTrace) {
      print('[ForceUpdateChecker] ❌ Error reading version config: $e');
      print('[ForceUpdateChecker] Stack trace: $stackTrace');
      return null;
    }
  }

  /// Verifică dacă aplicația necesită force update
  /// 
  /// Returns true dacă:
  /// - force_update = true în Firestore
  /// - build-ul local < min_build_number
  Future<bool> needsForceUpdate() async {
    try {
      final config = await getVersionConfig();
      if (config == null) {
        // Fail-safe: dacă nu putem citi config, nu blocăm app-ul
        return false;
      }

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
      } else {
        print('[ForceUpdateChecker] ✅ App is up to date');
      }

      return needsUpdate;
    } catch (e) {
      print('[ForceUpdateChecker] Error checking for update: $e');
      // Fail-safe: nu blocăm app-ul dacă verificarea eșuează
      return false;
    }
  }

  /// Obține URL-ul de download pentru platforma curentă
  /// 
  /// Returns null dacă nu există URL pentru platformă
  Future<String?> getDownloadUrl() async {
    try {
      final config = await getVersionConfig();
      if (config == null) return null;

      if (Platform.isAndroid) {
        return config.androidDownloadUrl;
      } else if (Platform.isIOS) {
        return config.iosDownloadUrl;
      }

      return null;
    } catch (e) {
      print('[ForceUpdateChecker] Error getting download URL: $e');
      return null;
    }
  }

  /// Obține mesajul de update
  Future<String> getUpdateMessage() async {
    try {
      final config = await getVersionConfig();
      return config?.updateMessage ?? 
          'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.';
    } catch (e) {
      print('[ForceUpdateChecker] Error getting update message: $e');
      return 'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.';
    }
  }

  /// Obține release notes
  Future<String> getReleaseNotes() async {
    try {
      final config = await getVersionConfig();
      return config?.releaseNotes ?? '';
    } catch (e) {
      print('[ForceUpdateChecker] Error getting release notes: $e');
      return '';
    }
  }
}
