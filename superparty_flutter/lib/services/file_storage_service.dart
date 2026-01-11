import 'dart:io';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import '../models/evidence_model.dart';

class FileStorageService {
  /// Obține path-ul directorului pentru un eveniment și categorie
  Future<String> getEventCategoryPath({
    required String eventId,
    required EvidenceCategory category,
  }) async {
    final appDir = await getApplicationDocumentsDirectory();
    final eventDir = path.join(
      appDir.path,
      'evidence',
      eventId,
      category.value,
    );
    
    // Creează directorul dacă nu există
    final directory = Directory(eventDir);
    if (!await directory.exists()) {
      await directory.create(recursive: true);
    }
    
    return eventDir;
  }

  /// Salvează un fișier local
  Future<String> saveLocalFile({
    required File sourceFile,
    required String eventId,
    required EvidenceCategory category,
  }) async {
    try {
      final dirPath = await getEventCategoryPath(
        eventId: eventId,
        category: category,
      );
      
      // Generează nume unic pentru fișier
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final extension = path.extension(sourceFile.path);
      final fileName = '$timestamp$extension';
      final targetPath = path.join(dirPath, fileName);
      
      // Copiază fișierul
      await sourceFile.copy(targetPath);
      
      return targetPath;
    } catch (e) {
      throw Exception('Eroare la salvarea fișierului local: $e');
    }
  }

  /// Șterge un fișier local
  Future<void> deleteLocalFile(String filePath) async {
    try {
      final file = File(filePath);
      if (await file.exists()) {
        await file.delete();
      }
    } catch (e) {
      debugPrint('Warning: Could not delete local file: $e');
    }
  }

  /// Verifică dacă un fișier există
  Future<bool> fileExists(String filePath) async {
    try {
      final file = File(filePath);
      return await file.exists();
    } catch (e) {
      return false;
    }
  }

  /// Obține dimensiunea unui fișier
  Future<int> getFileSize(String filePath) async {
    try {
      final file = File(filePath);
      if (await file.exists()) {
        return await file.length();
      }
      return 0;
    } catch (e) {
      return 0;
    }
  }

  /// Șterge toate fișierele pentru un eveniment
  Future<void> deleteEventFiles(String eventId) async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final eventDir = Directory(path.join(appDir.path, 'evidence', eventId));
      
      if (await eventDir.exists()) {
        await eventDir.delete(recursive: true);
      }
    } catch (e) {
      debugPrint('Warning: Could not delete event files: $e');
    }
  }

  /// Cleanup: șterge fișierele mai vechi de X zile
  Future<void> cleanupOldFiles({int daysOld = 30}) async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final evidenceDir = Directory(path.join(appDir.path, 'evidence'));
      
      if (!await evidenceDir.exists()) return;
      
      final cutoffDate = DateTime.now().subtract(Duration(days: daysOld));
      
      await for (final entity in evidenceDir.list(recursive: true)) {
        if (entity is File) {
          final stat = await entity.stat();
          if (stat.modified.isBefore(cutoffDate)) {
            await entity.delete();
          }
        }
      }
    } catch (e) {
      debugPrint('Warning: Could not cleanup old files: $e');
    }
  }

  /// Obține dimensiunea totală a cache-ului
  Future<int> getTotalCacheSize() async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final evidenceDir = Directory(path.join(appDir.path, 'evidence'));
      
      if (!await evidenceDir.exists()) return 0;
      
      int totalSize = 0;
      await for (final entity in evidenceDir.list(recursive: true)) {
        if (entity is File) {
          final stat = await entity.stat();
          totalSize += stat.size;
        }
      }
      
      return totalSize;
    } catch (e) {
      return 0;
    }
  }
}
