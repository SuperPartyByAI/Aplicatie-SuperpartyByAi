import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Schema guard (diagnostic, non-breaking). Logs anomalies only in debug.
/// Source: WHATSAPP_FLUTTER_IMPLEMENTATION.md Collections Used.

/// Thread: accountId, clientJid, lastMessageAt. Log doc.id + keys if any missing.
void logThreadSchemaAnomalies(DocumentSnapshot doc) {
  if (!kDebugMode) return;
  final raw = doc.data();
  if (raw == null || raw is! Map<String, dynamic>) return;
  final d = raw;
  final id = doc.id;
  final keys = d.keys.toList();
  final missing = <String>[];
  if (d['accountId'] == null) missing.add('accountId');
  if (d['clientJid'] == null) missing.add('clientJid');
  if (d['lastMessageAt'] == null) missing.add('lastMessageAt');
  if (missing.isEmpty) return;
  debugPrint(
    '[InboxSchemaGuard] thread $id missing: $missing | keys: $keys',
  );
}

/// Message: direction, (createdAt or tsClient), body (can be empty). Log anomalies.
void logMessageSchemaAnomalies(DocumentSnapshot doc) {
  if (!kDebugMode) return;
  final raw = doc.data();
  if (raw == null || raw is! Map<String, dynamic>) return;
  final d = raw;
  final id = doc.id;
  final keys = d.keys.toList();
  final missing = <String>[];
  if (d['direction'] == null) missing.add('direction');
  if (d['createdAt'] == null && d['tsClient'] == null) {
    missing.add('createdAt|tsClient');
  }
  if (!d.containsKey('body')) missing.add('body');
  if (missing.isEmpty) return;
  debugPrint(
    '[InboxSchemaGuard] message $id missing: $missing | keys: $keys',
  );
}
