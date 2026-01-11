import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Bridge pentru comunicare Flutter <-> Android native code (IO implementation)
class ApkInstallerBridge {
  static const MethodChannel _channel = MethodChannel(
    'com.superpartybyai.superparty_app/apk_installer',
  );

  /// Verifică dacă aplicația poate instala pachete
  static Future<bool> canInstallPackages() async {
    if (!Platform.isAndroid) {
      return false;
    }

    try {
      final result = await _channel.invokeMethod<bool>('canInstallPackages');
      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint(
          '[ApkInstallerBridge] Error checking install permission: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('[ApkInstallerBridge] Unexpected error: $e');
      return false;
    }
  }

  /// Instalează APK-ul de la path-ul specificat
  static Future<bool> installApk(String filePath) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('APK installation is only available on Android');
    }

    try {
      debugPrint('[ApkInstallerBridge] Installing APK: $filePath');

      final result = await _channel.invokeMethod<bool>(
        'installApk',
        {'filePath': filePath},
      );

      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('[ApkInstallerBridge] Install error: ${e.message}');
      throw Exception('Instalare eșuată: ${e.message}');
    } catch (e) {
      debugPrint('[ApkInstallerBridge] Unexpected error: $e');
      throw Exception('Eroare neașteptată la instalare');
    }
  }

  /// Deschide Settings pentru permisiunea "Install unknown apps"
  static Future<bool> openUnknownSourcesSettings() async {
    if (!Platform.isAndroid) {
      return false;
    }

    try {
      debugPrint('[ApkInstallerBridge] Opening unknown sources settings');

      final result = await _channel.invokeMethod<bool>(
        'openUnknownSourcesSettings',
      );

      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('[ApkInstallerBridge] Error opening settings: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('[ApkInstallerBridge] Unexpected error: $e');
      return false;
    }
  }
}
