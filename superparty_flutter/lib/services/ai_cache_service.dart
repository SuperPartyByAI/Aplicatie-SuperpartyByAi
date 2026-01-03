import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

/// Aggressive caching for AI responses with predictive prefetching
/// Cache is PERMANENT to help AI remember the user
class AICacheService {
  static const String _cachePrefix = 'ai_cache_';
  static const String _frequentQuestionsKey = 'frequent_questions';
  static const int _maxCacheEntries = 1000; // Max 1000 unique questions cached
  static const Duration _cacheDuration = Duration(days: 365 * 100); // Permanent (100 years)
  
  // Common questions with pre-cached responses
  static const Map<String, String> _commonResponses = {
    'bună': 'Bună! Cu ce te pot ajuta astăzi?',
    'salut': 'Salut! Sunt aici să te ajut. Ce dorești să știi?',
    'ce faci': 'Sunt gata să te ajut! Ce întrebări ai?',
    'ajutor': 'Desigur! Spune-mi cu ce ai nevoie de ajutor.',
    'mulțumesc': 'Cu plăcere! Dacă mai ai nevoie de ceva, sunt aici.',
    'ms': 'Cu plăcere! 😊',
    'ok': 'Perfect! Mai pot să te ajut cu ceva?',
    'da': 'Excelent! Continuăm?',
    'nu': 'Înțeles. Dacă schimbi părerea, sunt aici.',
  };

  /// Get cached response for a message
  static Future<String?> getCachedResponse(String message) async {
    final normalized = _normalizeMessage(message);
    
    // Check common responses first (instant)
    if (_commonResponses.containsKey(normalized)) {
      return _commonResponses[normalized];
    }
    
    // Check SharedPreferences cache (PERMANENT - no expiration)
    try {
      final prefs = await SharedPreferences.getInstance();
      final cacheKey = _cachePrefix + normalized;
      final cached = prefs.getString(cacheKey);
      
      if (cached != null) {
        final data = json.decode(cached);
        
        // Update lastAccessed timestamp (LRU tracking)
        data['lastAccessed'] = DateTime.now().toIso8601String();
        await prefs.setString(cacheKey, json.encode(data));
        
        return data['response'] as String;
      }
    } catch (e) {
      print('Cache read error: $e');
    }
    
    return null;
  }

  /// Save response to cache (PERMANENT)
  static Future<void> cacheResponse(String message, String response) async {
    final normalized = _normalizeMessage(message);
    
    // Don't cache very short or common responses
    if (normalized.length < 3 || _commonResponses.containsKey(normalized)) {
      return;
    }
    
    try {
      final prefs = await SharedPreferences.getInstance();
      final cacheKey = _cachePrefix + normalized;
      
      // Check if we need to cleanup old cache (LRU - Least Recently Used)
      await _cleanupOldCacheIfNeeded(prefs);
      
      final data = {
        'response': response,
        'timestamp': DateTime.now().toIso8601String(),
        'lastAccessed': DateTime.now().toIso8601String(),
      };
      
      await prefs.setString(cacheKey, json.encode(data));
      
      // Track frequent questions
      await _trackFrequentQuestion(normalized);
    } catch (e) {
      print('Cache write error: $e');
    }
  }
  
  /// Cleanup old cache entries if exceeds max (keep most recently used)
  static Future<void> _cleanupOldCacheIfNeeded(SharedPreferences prefs) async {
    try {
      final keys = prefs.getKeys();
      final cacheKeys = keys.where((k) => k.startsWith(_cachePrefix)).toList();
      
      if (cacheKeys.length >= _maxCacheEntries) {
        // Get all cache entries with timestamps
        final entries = <String, DateTime>{};
        
        for (final key in cacheKeys) {
          final cached = prefs.getString(key);
          if (cached != null) {
            try {
              final data = json.decode(cached);
              final lastAccessed = data['lastAccessed'] ?? data['timestamp'];
              entries[key] = DateTime.parse(lastAccessed);
            } catch (_) {}
          }
        }
        
        // Sort by last accessed (oldest first)
        final sorted = entries.entries.toList()
          ..sort((a, b) => a.value.compareTo(b.value));
        
        // Remove oldest 20% to make room
        final toRemove = (cacheKeys.length * 0.2).round();
        for (var i = 0; i < toRemove && i < sorted.length; i++) {
          await prefs.remove(sorted[i].key);
        }
        
        print('Cache cleanup: Removed $toRemove old entries');
      }
    } catch (e) {
      print('Cache cleanup error: $e');
    }
  }

  /// Track frequently asked questions for prefetching
  static Future<void> _trackFrequentQuestion(String message) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final frequentJson = prefs.getString(_frequentQuestionsKey);
      
      Map<String, int> frequent = {};
      if (frequentJson != null) {
        frequent = Map<String, int>.from(json.decode(frequentJson));
      }
      
      frequent[message] = (frequent[message] ?? 0) + 1;
      
      // Keep only top 50 frequent questions
      if (frequent.length > 50) {
        final sorted = frequent.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value));
        frequent = Map.fromEntries(sorted.take(50));
      }
      
      await prefs.setString(_frequentQuestionsKey, json.encode(frequent));
    } catch (e) {
      print('Frequent tracking error: $e');
    }
  }

  /// Get list of frequently asked questions
  static Future<List<String>> getFrequentQuestions({int limit = 10}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final frequentJson = prefs.getString(_frequentQuestionsKey);
      
      if (frequentJson != null) {
        final frequent = Map<String, int>.from(json.decode(frequentJson));
        final sorted = frequent.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value));
        return sorted.take(limit).map((e) => e.key).toList();
      }
    } catch (e) {
      print('Get frequent error: $e');
    }
    
    return [];
  }

  /// Clear all cache
  static Future<void> clearCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys();
      
      for (final key in keys) {
        if (key.startsWith(_cachePrefix)) {
          await prefs.remove(key);
        }
      }
      
      await prefs.remove(_frequentQuestionsKey);
    } catch (e) {
      print('Clear cache error: $e');
    }
  }

  /// Get cache statistics
  static Future<Map<String, int>> getCacheStats() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys();
      
      int totalCached = 0;
      
      for (final key in keys) {
        if (key.startsWith(_cachePrefix)) {
          totalCached++;
        }
      }
      
      return {
        'total': totalCached,
        'valid': totalCached, // All cache is permanent
        'expired': 0,
      };
    } catch (e) {
      print('Cache stats error: $e');
      return {'total': 0, 'valid': 0, 'expired': 0};
    }
  }

  /// Normalize message for caching (lowercase, trim, remove punctuation)
  static String _normalizeMessage(String message) {
    return message
        .toLowerCase()
        .trim()
        .replaceAll(RegExp(r'[?!.,;:]'), '')
        .replaceAll(RegExp(r'\s+'), ' ');
  }

  /// Prefetch responses for common questions (background task)
  static Future<void> prefetchCommonResponses() async {
    // This would be called on app startup or when idle
    // For now, common responses are hardcoded
    // In production, could fetch from server
  }
}
