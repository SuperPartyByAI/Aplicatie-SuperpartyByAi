import 'package:flutter/foundation.dart';

/// Model pentru configurația de versiune din Firestore
/// 
/// Schema Firestore (snake_case):
/// ```
/// app_config/version:
/// {
///   "min_version": "1.0.1",
///   "min_build_number": 2,
///   "force_update": true,
///   "update_message": "...",
///   "release_notes": "...",
///   "android_download_url": "...",
///   "ios_download_url": "...",
///   "updated_at": Timestamp
/// }
/// ```
class AppVersionConfig {
  final String minVersion;
  final int minBuildNumber;
  final bool forceUpdate;
  final String updateMessage;
  final String releaseNotes;
  final String? androidDownloadUrl;
  final String? iosDownloadUrl;
  final DateTime? updatedAt;

  AppVersionConfig({
    required this.minVersion,
    required this.minBuildNumber,
    required this.forceUpdate,
    required this.updateMessage,
    this.releaseNotes = '',
    this.androidDownloadUrl,
    this.iosDownloadUrl,
    this.updatedAt,
  });

  /// Create a safe default config (used when Firestore is unavailable)
  factory AppVersionConfig.safeDefault() {
    return AppVersionConfig(
      minVersion: '0.0.0',
      minBuildNumber: 0,
      forceUpdate: false, // CRITICAL: don't block app
      updateMessage: 'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.',
      releaseNotes: '',
      androidDownloadUrl: null,
      iosDownloadUrl: null,
      updatedAt: null,
    );
  }

  /// Parse din Firestore document data
  /// 
  /// FAIL-SAFE: Returns safe default config if required fields are missing.
  /// Supports multiple field name variations for backward compatibility:
  /// - min_version / latest_version / minVersion / latestVersion
  /// - min_build_number / latest_build_number / minBuildNumber / latestBuildNumber
  factory AppVersionConfig.fromFirestore(Map<String, dynamic> data) {
    // Try all possible field name variations (snake_case and camelCase)
    final minVersionRaw = data['min_version'] ?? 
                          data['latest_version'] ?? 
                          data['minVersion'] ?? 
                          data['latestVersion'];
    
    final minBuildNumberRaw = data['min_build_number'] ?? 
                              data['latest_build_number'] ?? 
                              data['minBuildNumber'] ?? 
                              data['latestBuildNumber'];

    // Normalize minVersion to String
    String? minVersion;
    if (minVersionRaw != null) {
      minVersion = minVersionRaw.toString();
      print('[AppVersionConfig] ✅ Found version field: $minVersion');
    }

    // Normalize minBuildNumber to int (handle String, double, int)
    int? minBuildNumber;
    if (minBuildNumberRaw != null) {
      if (minBuildNumberRaw is int) {
        minBuildNumber = minBuildNumberRaw;
      } else if (minBuildNumberRaw is double) {
        minBuildNumber = minBuildNumberRaw.toInt();
      } else if (minBuildNumberRaw is String) {
        minBuildNumber = int.tryParse(minBuildNumberRaw);
      }
      print('[AppVersionConfig] ✅ Found build number field: $minBuildNumber');
    }

    // FAIL-SAFE: If required fields are missing, return safe default
    if (minVersion == null || minBuildNumber == null) {
      print('[AppVersionConfig] ⚠️ Missing required fields in Firestore config');
      print('[AppVersionConfig] ⚠️ Using safe default: force_update=false, min_build_number=0');
      print('[AppVersionConfig] 💡 Recommendation: Update Firestore app_config/version with:');
      print('[AppVersionConfig]    - min_version: "1.0.0"');
      print('[AppVersionConfig]    - min_build_number: 1');
      
      return AppVersionConfig(
        minVersion: minVersion ?? '0.0.0',
        minBuildNumber: minBuildNumber ?? 0,
        forceUpdate: false, // SAFE DEFAULT: don't block app
        updateMessage: data['update_message'] as String? ?? 
            'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.',
        releaseNotes: data['release_notes'] as String? ?? '',
        androidDownloadUrl: data['android_download_url'] as String?,
        iosDownloadUrl: data['ios_download_url'] as String?,
        updatedAt: data['updated_at'] != null 
            ? DateTime.tryParse(data['updated_at'].toString())
            : null,
      );
    }

    // Log if using legacy field names
    if (data['latest_version'] != null || data['latest_build_number'] != null) {
      print('[AppVersionConfig] ℹ️ Legacy schema detected: using latest_* fields');
      print('[AppVersionConfig] 💡 Consider migrating to min_version and min_build_number');
    }

    return AppVersionConfig(
      minVersion: minVersion,
      minBuildNumber: minBuildNumber,
      forceUpdate: data['force_update'] as bool? ?? false,
      updateMessage: data['update_message'] as String? ?? 
          'O versiune nouă este disponibilă. Vă rugăm să actualizați aplicația.',
      releaseNotes: data['release_notes'] as String? ?? '',
      androidDownloadUrl: data['android_download_url'] as String?,
      iosDownloadUrl: data['ios_download_url'] as String?,
      updatedAt: data['updated_at'] != null 
          ? DateTime.tryParse(data['updated_at'].toString())
          : null,
    );
  }

  /// Convertește la Map pentru Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'min_version': minVersion,
      'min_build_number': minBuildNumber,
      'force_update': forceUpdate,
      'update_message': updateMessage,
      'release_notes': releaseNotes,
      if (androidDownloadUrl != null) 'android_download_url': androidDownloadUrl,
      if (iosDownloadUrl != null) 'ios_download_url': iosDownloadUrl,
      'updated_at': DateTime.now().toIso8601String(),
    };
  }

  @override
  String toString() {
    return 'AppVersionConfig(minVersion: $minVersion, minBuildNumber: $minBuildNumber, '
        'forceUpdate: $forceUpdate, androidUrl: $androidDownloadUrl)';
  }
}
