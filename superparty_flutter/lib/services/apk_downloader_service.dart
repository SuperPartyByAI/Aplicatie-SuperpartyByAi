import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:flutter/foundation.dart';

/// Service pentru download APK direct din Firebase Storage
class ApkDownloaderService {
  /// Descarcă APK-ul din Firebase Storage
  /// 
  /// Returnează path-ul local al fișierului descărcat
  static Future<String?> downloadApk(
    String downloadUrl, {
    Function(double)? onProgress,
  }) async {
    try {
      print('[ApkDownloader] Starting download from: $downloadUrl');
      
      // 1. Obține directorul de download
      final directory = await getExternalStorageDirectory();
      if (directory == null) {
        print('[ApkDownloader] External storage not available');
        return null;
      }
      
      // 2. Creează path pentru APK
      final filePath = '${directory.path}/superparty-update.apk';
      final file = File(filePath);
      
      // 3. Șterge fișierul vechi dacă există
      if (await file.exists()) {
        await file.delete();
        print('[ApkDownloader] Deleted old APK');
      }
      
      // 4. Download cu progress
      final request = await http.Client().send(http.Request('GET', Uri.parse(downloadUrl)));
      final contentLength = request.contentLength ?? 0;
      
      print('[ApkDownloader] Content length: ${contentLength / 1024 / 1024} MB');
      
      final bytes = <int>[];
      var downloadedBytes = 0;
      
      await for (final chunk in request.stream) {
        bytes.addAll(chunk);
        downloadedBytes += chunk.length;
        
        if (contentLength > 0) {
          final progress = downloadedBytes / contentLength;
          onProgress?.call(progress);
          
          if (downloadedBytes % (1024 * 1024) == 0) {
            print('[ApkDownloader] Downloaded: ${downloadedBytes / 1024 / 1024} MB');
          }
        }
      }
      
      // 5. Salvează fișierul
      await file.writeAsBytes(bytes);
      print('[ApkDownloader] APK saved to: $filePath');
      
      return filePath;
      
    } catch (e) {
      print('[ApkDownloader] Error: $e');
      return null;
    }
  }
  
  /// Instalează APK-ul descărcat (Android only)
  /// 
  /// Necesită permisiune REQUEST_INSTALL_PACKAGES
  static Future<bool> installApk(String filePath) async {
    try {
      if (!Platform.isAndroid) {
        print('[ApkDownloader] Install only available on Android');
        return false;
      }
      
      print('[ApkDownloader] Installing APK from: $filePath');
      
      // Folosește package: open_file pentru a deschide APK-ul
      // User va vedea prompt-ul de instalare Android
      
      // TODO: Implementează cu open_file package
      // await OpenFile.open(filePath);
      
      return true;
      
    } catch (e) {
      print('[ApkDownloader] Install error: $e');
      return false;
    }
  }
}
