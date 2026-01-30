import 'package:cloud_firestore/cloud_firestore.dart';

/// Shared "thread time" for inbox sort (WhatsApp phone order: last message first, inbound or outbound).
///
/// Canonical "last activity" = lastMessageAt / lastMessageAtMs (updated for both inbound and outbound).
/// Fallback order: lastMessageAtMs → lastMessageAt → updatedAt → lastMessageTimestamp → 0.
/// Use in Staff Inbox, WhatsApp Inbox (All Accounts), Employee Inbox. Sort desc + stable tie-break on thread id.
int threadTimeMs(Map<String, dynamic> t) {
  // a) lastMessageAtMs (int or num; ignore 0)
  final lastMs = t['lastMessageAtMs'];
  if (lastMs is int && lastMs > 0) return lastMs;
  if (lastMs is num && lastMs.toInt() > 0) return lastMs.toInt();

  // b) lastMessageAt (canonical last activity; robust parse)
  final lastMessageAt = parseAnyTimestamp(t['lastMessageAt']);
  if (lastMessageAt != null) return lastMessageAt.millisecondsSinceEpoch;

  // c) updatedAt fallback (edge cases)
  final updatedAt = parseAnyTimestamp(t['updatedAt']);
  if (updatedAt != null) return updatedAt.millisecondsSinceEpoch;

  // d) lastMessageTimestamp last fallback
  final lmt = t['lastMessageTimestamp'];
  if (lmt is int || lmt is num) {
    final ts = (lmt as num).toInt();
    if (ts > 1000000000000) return ts;
    if (ts > 1000000000) return ts * 1000;
  }

  return 0;
}

/// Shared timestamp parser. Handles Timestamp, DateTime, Map (_seconds/_milliseconds/seconds/milliseconds), String ISO, int/num (sec vs ms).
DateTime? parseAnyTimestamp(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is Timestamp) return v.toDate();
  try {
    final dt = (v as dynamic).toDate?.call();
    if (dt is DateTime) return dt;
  } catch (_) {}
  if (v is String) {
    final p = DateTime.tryParse(v);
    if (p != null) return p;
  }
  if (v is Map) {
    final ms = v['_milliseconds'] ?? v['milliseconds'];
    if (ms is num) return DateTime.fromMillisecondsSinceEpoch(ms.toInt());
    final s = v['_seconds'] ?? v['seconds'] ?? v['sec'];
    if (s is num) return DateTime.fromMillisecondsSinceEpoch(s.toInt() * 1000);
  }
  if (v is int || v is num) {
    final n = (v as num).toInt();
    if (n > 1000000000000) return DateTime.fromMillisecondsSinceEpoch(n);
    if (n > 1000000000) return DateTime.fromMillisecondsSinceEpoch(n * 1000);
  }
  return null;
}
