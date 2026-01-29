import 'package:cloud_firestore/cloud_firestore.dart';

/// Normalized thread for Inbox UI. Supports multiple Firestore/API key variants.
class ThreadModel {
  final String threadId;
  final String displayName;
  final String clientJid;
  final String lastMessageText;
  final DateTime? lastMessageAt;
  final int unreadCount;
  final String? profilePictureUrl;
  final String? normalizedPhone;
  final String? accountId;
  final String? accountName;
  final String? redirectTo;
  final String? canonicalThreadId;
  final String? groupSubject;
  final String? lastMessageSenderName;

  const ThreadModel({
    required this.threadId,
    required this.displayName,
    required this.clientJid,
    required this.lastMessageText,
    this.lastMessageAt,
    this.unreadCount = 0,
    this.profilePictureUrl,
    this.normalizedPhone,
    this.accountId,
    this.accountName,
    this.redirectTo,
    this.canonicalThreadId,
    this.groupSubject,
    this.lastMessageSenderName,
  });

  static String _readString(dynamic value, {List<String> mapKeys = const []}) {
    if (value is String) return value;
    if (value is Map) {
      for (final k in mapKeys) {
        final v = value[k];
        if (v is String) return v;
      }
    }
    if (value is num) return value.toString();
    return '';
  }

  static DateTime? _parseTime(dynamic raw) {
    if (raw == null) return null;
    if (raw is Timestamp) return raw.toDate();
    if (raw is Map && raw['_seconds'] is int) {
      return DateTime.fromMillisecondsSinceEpoch((raw['_seconds'] as int) * 1000);
    }
    if (raw is int) {
      if (raw > 1e12) return DateTime.fromMillisecondsSinceEpoch(raw);
      return DateTime.fromMillisecondsSinceEpoch(raw * 1000);
    }
    if (raw is String) return DateTime.tryParse(raw);
    return null;
  }

  static String? _extractPhoneFromJid(String? jid) {
    if (jid == null || jid.isEmpty) return null;
    if (jid.contains('@lid') || jid.contains('@broadcast')) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0].replaceAll(RegExp(r'\D'), '');
    if (digits.length < 6 || digits.length > 15) return null;
    return '+$digits';
  }

  static bool _looksLikePhone(String v) {
    final t = v.trim();
    if (t.isEmpty) return false;
    if (t.contains('@')) return true;
    return RegExp(r'^\+?[\d\s\-\(\)]{6,}$').hasMatch(t);
  }

  static String _readFirst(Map<String, dynamic> json, List<String> keys) {
    for (final k in keys) {
      final v = _readString(json[k]).trim();
      if (v.isNotEmpty) return v;
    }
    return '';
  }

  /// Build from Firestore/API map with fallbacks.
  factory ThreadModel.fromJson(Map<String, dynamic> json) {
    final id = _readFirst(json, ['threadId', 'id']);
    final idFallback = json['id'] ?? json['threadId'];
    final resolvedId = id.isEmpty && idFallback != null
        ? (idFallback is String ? idFallback : idFallback.toString())
        : id;
    final jid = _readFirst(
      json,
      ['clientJid', 'canonicalJid', 'jid', 'remoteJid'],
    );
    String displayName = _readFirst(json, ['displayName', 'name', 'pushName']);
    final groupSubject = _readString(json['groupSubject']).trim();
    final lastSender = _readString(json['lastMessageSenderName']).trim();
    String lastMessageText = _readFirst(
      json,
      [
        'lastMessageText',
        'lastMessagePreview',
        'lastMessageBody',
        'lastMessage',
      ],
    );
    // Backend writes phoneE164/phone/phoneNumber; rarely normalizedPhone. Use all.
    final normalizedPhone = _readFirst(
      json,
      ['normalizedPhone', 'phoneE164', 'phone', 'phoneNumber'],
    ).trim();
    final phone = normalizedPhone.isNotEmpty
        ? normalizedPhone
        : _extractPhoneFromJid(jid);

    // SAFETY NET: If displayName looks like message text (equals lastMessageText),
    // treat it as invalid and force fallback to phone
    final rawDisplayName = displayName.trim();
    final lastMessageTextTrimmed = lastMessageText.trim();
    if (rawDisplayName.isNotEmpty &&
        lastMessageTextTrimmed.isNotEmpty &&
        rawDisplayName.toLowerCase() == lastMessageTextTrimmed.toLowerCase()) {
      // displayName equals lastMessageText - this is likely corrupted data
      // Force fallback by clearing displayName
      displayName = '';
    }

    if (displayName.isEmpty || _looksLikePhone(displayName)) {
      if (groupSubject.isNotEmpty && !_looksLikePhone(groupSubject)) {
        displayName = groupSubject;
      } else if (lastSender.isNotEmpty && !_looksLikePhone(lastSender)) {
        displayName = lastSender;
      }
    }
    if ((displayName.isEmpty || _looksLikePhone(displayName)) &&
        phone != null &&
        phone.isNotEmpty &&
        !jid.endsWith('@broadcast')) {
      displayName = phone.replaceAllMapped(
        RegExp(r'^\+(\d{1,4})(\d{3})(\d{3})(\d{3,})$'),
        (m) => '+${m[1]} ${m[2]} ${m[3]} ${m[4]}',
      );
      if (displayName == phone && phone.length > 4 && phone.startsWith('+')) {
        final digits = phone.substring(1);
        final parts = <String>[];
        for (int i = 0; i < digits.length; i += 3) {
          parts.add(digits.substring(i, (i + 3).clamp(0, digits.length)));
        }
        displayName = '+${parts.join(' ')}';
      }
    }

    DateTime? lastMessageAt;
    if (json['lastMessageAtMs'] is int) {
      lastMessageAt = DateTime.fromMillisecondsSinceEpoch(json['lastMessageAtMs'] as int);
    } else {
      lastMessageAt = _parseTime(json['lastMessageAt']);
    }
    if (lastMessageAt == null && json['lastMessageTimestamp'] is int) {
      lastMessageAt = DateTime.fromMillisecondsSinceEpoch(
        (json['lastMessageTimestamp'] as int) * 1000,
      );
    }
    lastMessageAt ??= _parseTime(json['updatedAt']);
    lastMessageAt ??= _parseTime(json['timestamp']);

    int unread = 0;
    final u = json['unreadCount'] ?? json['unread'];
    if (u is int) unread = u;
    if (u is num) unread = u.toInt();

    String? photoUrl = json['profilePictureUrl'] as String?;
    photoUrl ??= json['photoUrl'] as String?;
    photoUrl ??= json['avatarUrl'] as String?;
    if (photoUrl != null) photoUrl = photoUrl.trim();
    if (photoUrl != null && photoUrl.isEmpty) photoUrl = null;

    return ThreadModel(
      threadId: resolvedId.isEmpty ? '' : resolvedId,
      displayName: displayName,
      clientJid: jid,
      lastMessageText: lastMessageText,
      lastMessageAt: lastMessageAt,
      unreadCount: unread,
      profilePictureUrl: photoUrl,
      normalizedPhone: normalizedPhone.isEmpty ? null : normalizedPhone,
      accountId: json['accountId'] as String?,
      accountName: json['accountName'] as String?,
      redirectTo: _readString(json['redirectTo']).trim().isEmpty ? null : _readString(json['redirectTo']).trim(),
      canonicalThreadId: _readString(json['canonicalThreadId']).trim().isEmpty ? null : _readString(json['canonicalThreadId']).trim(),
      groupSubject: groupSubject.isEmpty ? null : groupSubject,
      lastMessageSenderName: lastSender.isEmpty ? null : lastSender,
    );
  }

  /// Alias for threadId (spec compatibility).
  String get id => threadId;

  String? get phone => normalizedPhone?.isNotEmpty == true
      ? normalizedPhone
      : _extractPhoneFromJid(clientJid);

  /// Initial for avatar when no profile picture. No "?" when we have number/name.
  String get initial {
    // If displayName is not empty and doesn't look like a phone number, use first char
    if (displayName.isNotEmpty && !_looksLikePhone(displayName)) {
      return displayName[0].toUpperCase();
    }
    // If displayName looks like phone or is empty, extract first digit from phone
    // First try to extract from phone property
    final p = phone;
    if (p != null && p.isNotEmpty) {
      final digits = p.replaceAll(RegExp(r'\D'), '');
      if (digits.isNotEmpty) return digits[0];
    }
    // If phone is null but displayName looks like phone, extract first digit from displayName
    if (displayName.isNotEmpty && _looksLikePhone(displayName)) {
      final digits = displayName.replaceAll(RegExp(r'\D'), '');
      if (digits.isNotEmpty) return digits[0];
    }
    // FIX: Dacă nici displayName nici phone nu există, încearcă să extragă din clientJid
    if (clientJid.isNotEmpty) {
      final parts = clientJid.split('@');
      if (parts.isNotEmpty && parts[0].isNotEmpty) {
        final firstChar = parts[0][0].toUpperCase();
        if (RegExp(r'[A-Za-z0-9]').hasMatch(firstChar)) {
          return firstChar;
        }
      }
    }
    return '?';
  }
}
