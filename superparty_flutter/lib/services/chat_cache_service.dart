import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';

class ChatCacheService {
  static Database? _database;
  static const int MAX_CACHE_SIZE = 100000; // 100K messages

  static Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  static Future<Database> _initDatabase() async {
    final documentsDirectory = await getApplicationDocumentsDirectory();
    final path = join(documentsDirectory.path, 'chat_cache.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sessionId TEXT,
            userMessage TEXT,
            aiResponse TEXT,
            timestamp INTEGER,
            important INTEGER DEFAULT 0
          )
        ''');
        await db
            .execute('CREATE INDEX idx_timestamp ON messages(timestamp DESC)');
        await db.execute('CREATE INDEX idx_important ON messages(important)');
      },
    );
  }

  // Save message to cache
  static Future<void> saveMessage({
    required String sessionId,
    required String userMessage,
    required String aiResponse,
    bool important = false,
  }) async {
    final db = await database;

    await db.insert('messages', {
      'sessionId': sessionId,
      'userMessage': userMessage,
      'aiResponse': aiResponse,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'important': important ? 1 : 0,
    });

    // Cleanup old messages if cache exceeds limit
    await _cleanupOldMessages();
  }

  // Get recent messages from cache
  static Future<List<Map<String, dynamic>>> getRecentMessages(
      {int limit = 50}) async {
    final db = await database;
    return await db.query(
      'messages',
      orderBy: 'timestamp DESC',
      limit: limit,
    );
  }

  // Get important messages for AI context
  static Future<List<Map<String, dynamic>>> getImportantMessages(
      {int limit = 10}) async {
    final db = await database;
    return await db.query(
      'messages',
      where: 'important = ?',
      whereArgs: [1],
      orderBy: 'timestamp DESC',
      limit: limit,
    );
  }

  // Get all messages (for full history view)
  static Future<List<Map<String, dynamic>>> getAllMessages() async {
    final db = await database;
    return await db.query(
      'messages',
      orderBy: 'timestamp DESC',
    );
  }

  // Search messages
  static Future<List<Map<String, dynamic>>> searchMessages(String query) async {
    final db = await database;
    return await db.query(
      'messages',
      where: 'userMessage LIKE ? OR aiResponse LIKE ?',
      whereArgs: ['%$query%', '%$query%'],
      orderBy: 'timestamp DESC',
    );
  }

  // Cleanup old messages to maintain cache size
  static Future<void> _cleanupOldMessages() async {
    final db = await database;
    final count = Sqflite.firstIntValue(
      await db.rawQuery('SELECT COUNT(*) FROM messages'),
    );

    if (count != null && count > MAX_CACHE_SIZE) {
      // Keep only the most recent MAX_CACHE_SIZE messages
      await db.execute('''
        DELETE FROM messages 
        WHERE id NOT IN (
          SELECT id FROM messages 
          ORDER BY timestamp DESC 
          LIMIT $MAX_CACHE_SIZE
        )
      ''');
    }
  }

  // Clear all cache
  static Future<void> clearCache() async {
    final db = await database;
    await db.delete('messages');
  }

  // Get cache statistics
  static Future<Map<String, int>> getCacheStats() async {
    final db = await database;
    final totalCount = Sqflite.firstIntValue(
          await db.rawQuery('SELECT COUNT(*) FROM messages'),
        ) ??
        0;

    final importantCount = Sqflite.firstIntValue(
          await db
              .rawQuery('SELECT COUNT(*) FROM messages WHERE important = 1'),
        ) ??
        0;

    return {
      'total': totalCount,
      'important': importantCount,
    };
  }
}
