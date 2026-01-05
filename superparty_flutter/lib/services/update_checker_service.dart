import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:package_info_plus/package_info_plus.dart';

class AppVersionInfo {
  final String latestVersion;
  final int latestBuildNumber;
  final String minRequiredVersion;
  final int minRequiredBuildNumber;
  final String apkUrl;
  final bool forceUpdate;
  final String updateMessage;
  final String releaseNotes;

  AppVersionInfo({
    required this.latestVersion,
    required this.latestBuildNumber,
    required this.minRequiredVersion,
    required this.minRequiredBuildNumber,
    required this.apkUrl,
    required this.forceUpdate,
    required this.updateMessage,
    required this.releaseNotes,
  });

  factory AppVersionInfo.fromFirestore(Map<String, dynamic> data) {
    return AppVersionInfo(
      latestVersion: data['latestVersion'] ?? '1.0.0',
      latestBuildNumber: data['latestBuildNumber'] ?? 1,
      minRequiredVersion: data['minRequiredVersion'] ?? '1.0.0',
      minRequiredBuildNumber: data['minRequiredBuildNumber'] ?? 1,
      apkUrl: data['apkUrl'] ?? '',
      forceUpdate: data['forceUpdate'] ?? false,
      updateMessage: data['updateMessage'] ?? 'Versiune nouă disponibilă!',
      releaseNotes: data['releaseNotes'] ?? '',
    );
  }
}

class UpdateCheckerService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<AppVersionInfo?> checkForUpdate() async {
    try {
      final doc = await _firestore.collection('app_config').doc('version').get();
      
      if (!doc.exists) {
        return null;
      }

      return AppVersionInfo.fromFirestore(doc.data()!);
    } catch (e) {
      // Fail silently - don't block app if version check fails
      return null;
    }
  }

  Future<bool> isUpdateRequired() async {
    final versionInfo = await checkForUpdate();
    if (versionInfo == null) return false;

    final packageInfo = await PackageInfo.fromPlatform();
    final currentBuildNumber = int.tryParse(packageInfo.buildNumber) ?? 1;

    // Force update if current build is less than minimum required
    if (versionInfo.forceUpdate && currentBuildNumber < versionInfo.minRequiredBuildNumber) {
      return true;
    }

    return false;
  }

  Future<bool> isUpdateAvailable() async {
    final versionInfo = await checkForUpdate();
    if (versionInfo == null) return false;

    final packageInfo = await PackageInfo.fromPlatform();
    final currentBuildNumber = int.tryParse(packageInfo.buildNumber) ?? 1;

    // Update available if latest build is greater than current
    return currentBuildNumber < versionInfo.latestBuildNumber;
  }
}
