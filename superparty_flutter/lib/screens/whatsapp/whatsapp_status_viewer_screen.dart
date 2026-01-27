import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/whatsapp_api_service.dart';

class WhatsAppStatusViewerScreen extends StatefulWidget {
  final String? accountId;
  final String? senderJid;
  final String? senderName;

  const WhatsAppStatusViewerScreen({
    super.key,
    this.accountId,
    this.senderJid,
    this.senderName,
  });

  @override
  State<WhatsAppStatusViewerScreen> createState() => _WhatsAppStatusViewerScreenState();
}

class _WhatsAppStatusViewerScreenState extends State<WhatsAppStatusViewerScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  StreamSubscription<QuerySnapshot>? _subscription;
  final Map<String, String> _mediaUrlCache = {};
  final Set<String> _mediaUnavailable = {};
  List<QueryDocumentSnapshot> _messages = [];

  @override
  void initState() {
    super.initState();
    _listen();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  void _listen() {
    final accountId = widget.accountId;
    if (accountId == null || accountId.isEmpty) return;
    final threadId = '${accountId}__status@broadcast';
    final query = FirebaseFirestore.instance
        .collection('threads')
        .doc(threadId)
        .collection('messages')
        .orderBy('tsSort', descending: true)
        .limit(200);
    _subscription = query.snapshots().listen((snapshot) {
      final senderJid = widget.senderJid?.trim();
      final senderName = widget.senderName?.trim();
      final filtered = snapshot.docs.where((doc) {
        final data = doc.data();
        final msgSenderJid = data['senderJid']?.toString();
        final msgSenderName = data['senderName']?.toString();
        if (senderJid != null && senderJid.isNotEmpty) {
          return msgSenderJid == senderJid;
        }
        if (senderName != null && senderName.isNotEmpty) {
          return msgSenderName == senderName;
        }
        return false;
      }).toList();
      setState(() => _messages = filtered);
    });
  }

  /// Returns (url, unimplemented). When unimplemented, UI shows "Media unavailable".
  Future<(String?, bool)> _resolveMediaUrl(String storagePath) async {
    if (_mediaUrlCache.containsKey(storagePath)) {
      return (_mediaUrlCache[storagePath], false);
    }
    try {
      final result = await _apiService.getMediaUrl(storagePath: storagePath);
      if (result['unimplemented'] == true) {
        return (null, true);
      }
      final url = result['url']?.toString();
      if (url != null && url.isNotEmpty) {
        _mediaUrlCache[storagePath] = url;
        return (url, false);
      }
    } catch (_) {
      // Ignore
    }
    return (null, false);
  }

  Widget? _buildMediaWidget(Map<String, dynamic>? media) {
    if (media == null) return null;
    final storagePath = media['storagePath']?.toString();
    final cachedUrl = storagePath != null ? _mediaUrlCache[storagePath] : null;
    final rawUrl = media['url']?.toString();
    final normalizedStoragePath = (rawUrl != null && rawUrl.startsWith('media-url:'))
        ? rawUrl.replaceFirst('media-url:', '')
        : storagePath;
    final url = (cachedUrl != null && cachedUrl.isNotEmpty)
        ? cachedUrl
        : (rawUrl != null && rawUrl.isNotEmpty && !rawUrl.startsWith('media-url:')
            ? rawUrl
            : null);
    final type = media['type']?.toString() ?? 'unknown';
    final thumbBase64 = media['thumbBase64']?.toString();

    Widget? thumb;
    if (thumbBase64 != null && thumbBase64.isNotEmpty) {
      try {
        final bytes = base64Decode(thumbBase64);
        thumb = Image.memory(bytes, fit: BoxFit.cover);
      } catch (_) {
        thumb = null;
      }
    }

    if (url == null || url.isEmpty) {
      if (normalizedStoragePath == null || normalizedStoragePath.isEmpty) return null;
      final unavailable = _mediaUnavailable.contains(normalizedStoragePath);
      return InkWell(
        onTap: unavailable
            ? null
            : () async {
                final (nextUrl, unimplemented) =
                    await _resolveMediaUrl(normalizedStoragePath);
                if (!mounted) return;
                if (unimplemented) {
                  setState(() => _mediaUnavailable.add(normalizedStoragePath));
                } else if (nextUrl != null) {
                  setState(() {});
                }
              },
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey[900],
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.grey[700]!),
          ),
          child: Row(
            children: [
              Icon(
                unavailable ? Icons.visibility_off : Icons.link,
                size: 18,
                color: Colors.white70,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  unavailable ? 'Media unavailable' : 'Tap to load media',
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (type == 'image' || type == 'sticker') {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          placeholder: (context, _) => Container(
            height: 220,
            color: Colors.grey[900],
          ),
          errorWidget: (context, _, __) => Container(
            height: 220,
            color: Colors.grey[800],
            alignment: Alignment.center,
            child: const Icon(Icons.broken_image, color: Colors.white70),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[900],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.insert_drive_file, color: Colors.white70),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              type.toUpperCase(),
              style: const TextStyle(color: Colors.white70),
            ),
          ),
          thumb ?? const SizedBox.shrink(),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.senderName?.trim().isNotEmpty == true
        ? widget.senderName!.trim()
        : (widget.senderJid ?? 'Status');

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        backgroundColor: const Color(0xFF25D366),
      ),
      body: _messages.isEmpty
          ? const Center(child: Text('No status messages'))
          : ListView.builder(
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final doc = _messages[index];
                final data = doc.data() as Map<String, dynamic>;
                final ts = data['tsSort'];
                final timestamp = ts is Timestamp ? ts.toDate() : null;
                final body = data['body']?.toString() ?? '';
                final mediaRaw = data['media'];
                final media = mediaRaw is Map
                    ? mediaRaw.map((key, value) => MapEntry(key.toString(), value))
                    : null;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (media != null) _buildMediaWidget(media) ?? const SizedBox.shrink(),
                      if (body.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(body),
                        ),
                      if (timestamp != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            DateFormat('HH:mm').format(timestamp),
                            style: TextStyle(color: Colors.grey[600], fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
