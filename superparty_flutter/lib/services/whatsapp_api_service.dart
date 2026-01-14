import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

/// HTTP client for WhatsApp backend (Baileys).
///
/// - Base URL is read from Firestore: `app_config/whatsapp_connector.baseUrl`
/// - Sends Firebase ID token in `Authorization: Bearer`.
class WhatsAppApiService {
  static const String _defaultBaseUrl =
      'https://whats-upp-production.up.railway.app';

  static final WhatsAppApiService instance = WhatsAppApiService._();
  WhatsAppApiService._();

  String? _cachedBaseUrl;
  DateTime? _cachedAt;

  Future<String> _getBaseUrl() async {
    final now = DateTime.now();
    if (_cachedBaseUrl != null &&
        _cachedAt != null &&
        now.difference(_cachedAt!).inMinutes < 5) {
      return _cachedBaseUrl!;
    }

    try {
      final snap = await FirebaseFirestore.instance
          .collection('app_config')
          .doc('whatsapp_connector')
          .get();
      final data = snap.data();
      final url = (data?['baseUrl'] ?? '').toString().trim();
      if (url.isNotEmpty) {
        _cachedBaseUrl = url;
        _cachedAt = now;
        return url;
      }
    } catch (_) {
      // ignore: fallback
    }

    _cachedBaseUrl = _defaultBaseUrl;
    _cachedAt = now;
    return _defaultBaseUrl;
  }

  Future<Map<String, String>> _headers({bool includeAuth = true}) async {
    final h = <String, String>{
      'Content-Type': 'application/json',
    };
    if (includeAuth) {
      try {
        final u = FirebaseAuth.instance.currentUser;
        final token = await u?.getIdToken();
        if (token != null && token.isNotEmpty) {
          h['Authorization'] = 'Bearer $token';
        }
      } catch (_) {
        // ignore
      }
    }
    return h;
  }

  Uri _u(String baseUrl, String path) {
    final b = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final p = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$b$p');
  }

  Future<void> send({
    required String threadId,
    required String accountId,
    required String to,
    required String text,
    required String clientMessageId,
    String? chatId,
  }) async {
    final base = await _getBaseUrl();
    final res = await http.post(
      _u(base, '/api/send'),
      headers: await _headers(),
      body: jsonEncode({
        'threadId': threadId,
        'accountId': accountId,
        if (chatId != null && chatId.trim().isNotEmpty) 'chatId': chatId.trim(),
        'to': to,
        'text': text,
        'clientMessageId': clientMessageId,
      }),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Send failed: HTTP ${res.statusCode} ${res.body}');
    }
  }

  Future<void> addAccount({
    required String name,
    String? phone,
  }) async {
    final base = await _getBaseUrl();
    final res = await http.post(
      _u(base, '/api/accounts'),
      headers: await _headers(),
      body: jsonEncode({
        'name': name,
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      }),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Add account failed: HTTP ${res.statusCode} ${res.body}');
    }
  }

  Future<void> regenerateQr({required String accountId}) async {
    final base = await _getBaseUrl();
    final res = await http.post(
      _u(base, '/api/accounts/$accountId/regenerate-qr'),
      headers: await _headers(),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Regenerate QR failed: HTTP ${res.statusCode} ${res.body}');
    }
  }

  Future<void> deleteAccount({required String accountId}) async {
    final base = await _getBaseUrl();
    final res = await http.delete(
      _u(base, '/api/accounts/$accountId'),
      headers: await _headers(),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Delete account failed: HTTP ${res.statusCode} ${res.body}');
    }
  }
}

