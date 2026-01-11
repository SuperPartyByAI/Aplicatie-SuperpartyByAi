import 'package:flutter/foundation.dart';

/// Bridge pentru comunicare Flutter <-> Android native code (Web stub)
class ApkInstallerBridge {
  /// Verifică dacă aplicația poate instala pachete (Web: always false)
  static Future<bool> canInstallPackages() async {
    if (kDebugMode) {
      debugPrint('[ApkInstallerBridge] Web platform - APK installation not supported');
    }
    return false;
  }

  /// Instalează APK-ul de la path-ul specificat (Web: not supported)
  static Future<bool> installApk(String filePath) async {
    throw UnsupportedError('APK installation is not available on web');
  }

  /// Deschide Settings pentru permisiunea "Install unknown apps" (Web: not supported)
  static Future<bool> openUnknownSourcesSettings() async {
    if (kDebugMode) {
      debugPrint('[ApkInstallerBridge] Web platform - Settings not available');
    }
    return false;
  }
}
