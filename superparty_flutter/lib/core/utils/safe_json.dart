import 'dart:convert';

/// Safe JSON parsing helpers to avoid FormatException on HTML or malformed responses.
/// Use for HTTP response bodies when backend may return non-JSON (e.g. 404 HTML).
class SafeJson {
  SafeJson._();

  /// Safely decode [body] to Map. Returns null if not valid JSON object.
  /// - Leading whitespace trimmed; if not starting with '{', returns null.
  /// - JSON arrays return null (only Map supported).
  static Map<String, dynamic>? tryDecodeJsonMap(String body) {
    if (body.isEmpty) return null;
    final trimmed = body.trimLeft();
    if (!trimmed.startsWith('{')) return null;
    try {
      final decoded = jsonDecode(body);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  /// Preview of [body] for logging: single line, max [max] chars.
  static String bodyPreview(String body, {int max = 200}) {
    if (body.isEmpty) return '(empty)';
    final cleaned = body.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (cleaned.length <= max) return cleaned;
    return '${cleaned.substring(0, max)}...';
  }
}
