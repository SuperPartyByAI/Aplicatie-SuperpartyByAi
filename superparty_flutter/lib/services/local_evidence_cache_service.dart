import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import '../models/evidence_model.dart';

class LocalEvidenceCacheService {
  static Database? _database;

  static Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  static Future<Database> _initDatabase() async {
    final documentsDirectory = await getApplicationDocumentsDirectory();
    final path = join(documentsDirectory.path, 'evidence_cache.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE event_evidence_cache (
            id TEXT PRIMARY KEY,
            eventId TEXT NOT NULL,
            categorie TEXT NOT NULL,
            localPath TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            syncStatus TEXT NOT NULL,
            remoteUrl TEXT,
            remoteDocId TEXT,
            errorMessage TEXT,
            retryCount INTEGER DEFAULT 0
          )
        ''');

        await db.execute(
          'CREATE INDEX idx_event_category ON event_evidence_cache(eventId, categorie)',
        );
        await db.execute(
          'CREATE INDEX idx_sync_status ON event_evidence_cache(syncStatus)',
        );
      },
    );
  }

  /// Insert dovadă pending (local only)
  Future<void> insertPending(LocalEvidence evidence) async {
    final db = await database;
    await db.insert(
      'event_evidence_cache',
      evidence.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// List dovezi pentru un eveniment și categorie
  Future<List<LocalEvidence>> listByEventAndCategory({
    required String eventId,
    required EvidenceCategory categorie,
  }) async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'event_evidence_cache',
      where: 'eventId = ? AND categorie = ?',
      whereArgs: [eventId, categorie.value],
      orderBy: 'createdAt DESC',
    );

    return maps.map((map) => LocalEvidence.fromMap(map)).toList();
  }

  /// List toate dovezile pending (pentru sync)
  Future<List<LocalEvidence>> listPending() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'event_evidence_cache',
      where: 'syncStatus = ?',
      whereArgs: [SyncStatus.pending.value],
      orderBy: 'createdAt ASC',
    );

    return maps.map((map) => LocalEvidence.fromMap(map)).toList();
  }

  /// List toate dovezile failed (pentru retry)
  Future<List<LocalEvidence>> listFailed() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'event_evidence_cache',
      where: 'syncStatus = ?',
      whereArgs: [SyncStatus.failed.value],
      orderBy: 'createdAt ASC',
    );

    return maps.map((map) => LocalEvidence.fromMap(map)).toList();
  }

  /// Marchează dovadă ca synced
  Future<void> markSynced({
    required String id,
    required String remoteUrl,
    required String remoteDocId,
  }) async {
    final db = await database;
    await db.update(
      'event_evidence_cache',
      {
        'syncStatus': SyncStatus.synced.value,
        'remoteUrl': remoteUrl,
        'remoteDocId': remoteDocId,
        'errorMessage': null,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Marchează dovadă ca failed
  Future<void> markFailed({
    required String id,
    required String errorMessage,
  }) async {
    final db = await database;

    // Obține retry count curent
    final List<Map<String, dynamic>> maps = await db.query(
      'event_evidence_cache',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    final currentRetryCount =
        maps.isNotEmpty ? (maps.first['retryCount'] as int?) ?? 0 : 0;

    await db.update(
      'event_evidence_cache',
      {
        'syncStatus': SyncStatus.failed.value,
        'errorMessage': errorMessage,
        'retryCount': currentRetryCount + 1,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Șterge dovadă din cache
  Future<void> deleteById(String id) async {
    final db = await database;
    await db.delete(
      'event_evidence_cache',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Șterge toate dovezile synced pentru un eveniment (cleanup)
  Future<void> deleteSyncedByEvent(String eventId) async {
    final db = await database;
    await db.delete(
      'event_evidence_cache',
      where: 'eventId = ? AND syncStatus = ?',
      whereArgs: [eventId, SyncStatus.synced.value],
    );
  }

  /// Șterge toate dovezile pentru un eveniment
  Future<void> deleteAllByEvent(String eventId) async {
    final db = await database;
    await db.delete(
      'event_evidence_cache',
      where: 'eventId = ?',
      whereArgs: [eventId],
    );
  }

  /// Increment retry count
  Future<void> incrementRetryCount(String id) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE event_evidence_cache SET retryCount = retryCount + 1 WHERE id = ?',
      [id],
    );
  }

  /// Reset retry count
  Future<void> resetRetryCount(String id) async {
    final db = await database;
    await db.update(
      'event_evidence_cache',
      {'retryCount': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Obține o dovadă specifică
  Future<LocalEvidence?> getById(String id) async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'event_evidence_cache',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return LocalEvidence.fromMap(maps.first);
  }

  /// Obține count pentru status
  Future<int> getCountByStatus(SyncStatus status) async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM event_evidence_cache WHERE syncStatus = ?',
      [status.value],
    );

    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Cleanup: șterge dovezile synced mai vechi de X zile
  Future<void> cleanupOldSynced({int daysOld = 30}) async {
    final db = await database;
    final cutoffDate = DateTime.now().subtract(Duration(days: daysOld));
    final cutoffTimestamp = cutoffDate.millisecondsSinceEpoch;

    await db.delete(
      'event_evidence_cache',
      where: 'syncStatus = ? AND createdAt < ?',
      whereArgs: [SyncStatus.synced.value, cutoffTimestamp],
    );
  }

  /// Close database (pentru testing sau cleanup)
  static Future<void> close() async {
    final db = _database;
    if (db != null) {
      await db.close();
      _database = null;
    }
  }
}
