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

  /// Parse din Firestore document data
  /// 
  /// Throws FormatException dacă câmpurile obligatorii lipsesc sau au tip greșit
  factory AppVersionConfig.fromFirestore(Map<String, dynamic> data) {
    // Validare câmpuri obligatorii
    if (!data.containsKey('min_version')) {
      throw const FormatException('Missing required field: min_version');
    }
    if (!data.containsKey('min_build_number')) {
      throw const FormatException('Missing required field: min_build_number');
    }

    final minVersion = data['min_version'];
    if (minVersion is! String) {
      throw FormatException('min_version must be String, got ${minVersion.runtimeType}');
    }

    final minBuildNumber = data['min_build_number'];
    if (minBuildNumber is! int) {
      throw FormatException('min_build_number must be int, got ${minBuildNumber.runtimeType}');
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
