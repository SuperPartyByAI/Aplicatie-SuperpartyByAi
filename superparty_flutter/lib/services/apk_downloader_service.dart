import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

/// Service pentru download APK direct din Firebase Storage
/// 
/// Folosește stream-to-file pentru a evita OOM pe APK-uri mari
class ApkDownloaderService {
  /// Descarcă APK-ul din Firebase Storage
  /// 
  /// Stream-to-file: nu încarcă tot APK-ul în RAM
  /// Returnează path-ul local al fișierului descărcat
  static Future<String?> downloadApk(
    String downloadUrl, {
    Function(double)? onProgress,
  }) async {
    try {
      debugPrint('[ApkDownloader] Starting download from: $downloadUrl');
      
      // 1. Obține directorul app-specific (nu cere storage permission)
      final directory = await getExternalStorageDirectory();
      if (directory == null) {
        debugPrint('[ApkDownloader] External storage not available');
        return null;
      }
      
      // 2. Creează path pentru APK
      final filePath = '${directory.path}/superparty-update.apk';
      final file = File(filePath);
      
      // 3. Șterge fișierul vechi dacă există
      if (await file.exists()) {
        await file.delete();
        debugPrint('[ApkDownloader] Deleted old APK');
      }
      
      // 4. Inițiază request HTTP
      final request = await http.Client().send(
        http.Request('GET', Uri.parse(downloadUrl))
      );
      
      if (request.statusCode != 200) {
        debugPrint('[ApkDownloader] HTTP error: ${request.statusCode}');
        return null;
      }
      
      final contentLength = request.contentLength ?? 0;
      debugPrint('[ApkDownloader] Content length: ${contentLength / 1024 / 1024} MB');
      
      // 5. Stream direct la fișier (fără a încărca în RAM)
      final sink = file.openWrite();
      var downloadedBytes = 0;
      
      try {
        await for (final chunk in request.stream) {
          sink.add(chunk);
          downloadedBytes += chunk.length;
          
          if (contentLength > 0) {
            final progress = downloadedBytes / contentLength;
            onProgress?.call(progress);
            
            // Log la fiecare MB
            if (downloadedBytes % (1024 * 1024) == 0) {
              debugPrint('[ApkDownloader] Downloaded: ${downloadedBytes / 1024 / 1024} MB');
            }
          }
        }
      } finally {
        await sink.flush();
        await sink.close();
      }
      
      debugPrint('[ApkDownloader] APK saved to: $filePath');
      debugPrint('[ApkDownloader] Final size: ${downloadedBytes / 1024 / 1024} MB');
      
      return filePath;
      
    } catch (e) {
      debugPrint('[ApkDownloader] Error: $e');
      return null;
    }
  }
}
