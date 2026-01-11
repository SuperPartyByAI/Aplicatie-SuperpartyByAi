import 'package:flutter/foundation.dart';

/// Service pentru download APK direct din Firebase Storage (Web stub)
class ApkDownloaderService {
  /// Descarcă APK-ul din Firebase Storage (Web: not supported)
  static Future<String?> downloadApk(
    String downloadUrl, {
    Function(double)? onProgress,
  }) async {
    if (kDebugMode) {
      debugPrint('[ApkDownloader] Web platform - APK download not supported');
    }
    return null;
  }
}
