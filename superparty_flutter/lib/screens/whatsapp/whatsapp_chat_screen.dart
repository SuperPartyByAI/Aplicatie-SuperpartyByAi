import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../services/whatsapp_api_service.dart';

String getDisplayInitial(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) {
    return '?';
  }
  return trimmed[0].toUpperCase();
}

/// WhatsApp Chat Screen - Messages + Send + CRM Panel
class WhatsAppChatScreen extends StatefulWidget {
  final String? accountId;
  final String? threadId;
  final String? clientJid;
  final String? phoneE164;

  const WhatsAppChatScreen({
    super.key,
    this.accountId,
    this.threadId,
    this.clientJid,
    this.phoneE164,
  });

  @override
  State<WhatsAppChatScreen> createState() => _WhatsAppChatScreenState();
}

class _WhatsAppChatScreenState extends State<WhatsAppChatScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isSending = false;
  bool _showCrmPanel = false;
  Map<String, dynamic>? _draftEvent;
  List<Map<String, dynamic>> _apiMessages = [];
  bool _useApiMessages = false;
  bool _isLoadingMessages = false;
  Timer? _messagePoller;
  Timer? _firestoreTimeoutTimer;
  Timer? _firestoreIdleTimer;
  Timer? _apiProbeTimer;
  int _previousMessageCount = 0; // Track message count to detect new messages
  DateTime? _lastSendAt;
  String? _lastSentText;
  bool _initialScrollDone = false;
  bool _redirectChecked = false;
  String? _threadClientJid;
  String? _threadPhoneE164;
  String? _threadDisplayName;
  String? _effectiveThreadIdOverride;
  bool _firestoreStreamHealthy = false;
  DateTime? _lastFirestoreSnapshotAt;
  int? _lastApiCursorMs;
  int? _lastApiServerSeq;

  String? get _accountId => widget.accountId ?? _extractFromQuery('accountId');
  String? get _threadId => widget.threadId ?? _extractFromQuery('threadId');
  String? get _effectiveThreadId => _effectiveThreadIdOverride ?? _threadId;
  String? get _clientJid =>
      _threadClientJid ?? widget.clientJid ?? _extractFromQuery('clientJid');
  String? get _phoneE164 =>
      _threadPhoneE164 ?? widget.phoneE164 ?? _extractFromQuery('phoneE164');
  String? get _displayName =>
      _threadDisplayName ?? _extractFromQuery('displayName');

  String? _extractFromQuery(String param) {
    final uri = Uri.base;
    return uri.queryParameters[param];
  }

  String _maskId(String value) => value.hashCode.toRadixString(16);

  String _readString(dynamic value, {List<String> mapKeys = const []}) {
    if (value is String) return value;
    if (value is Map) {
      for (final key in mapKeys) {
        final nested = value[key];
        if (nested is String) return nested;
      }
    }
    if (value is num) return value.toString();
    return '';
  }

  @override
  void initState() {
    super.initState();
    _ensureCanonicalThread();
    _startFirestoreTimeoutWatchdog();
    _startFirestoreIdleWatchdog();
    _scheduleApiProbe();
  }

  @override
  void dispose() {
    _messagePoller?.cancel();
    _firestoreTimeoutTimer?.cancel();
    _firestoreIdleTimer?.cancel();
    _apiProbeTimer?.cancel();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _ensureCanonicalThread() async {
    if (_redirectChecked) return;
    _redirectChecked = true;
    if (_threadId == null || _accountId == null) {
      return;
    }

    try {
      final threadDoc = await FirebaseFirestore.instance
          .collection('threads')
          .doc(_threadId!)
          .get();
      if (!threadDoc.exists) {
        return;
      }

      final data = threadDoc.data() ?? <String, dynamic>{};
      final redirectTo = _readString(data['redirectTo']).trim();
      final canonicalThreadId = _readString(data['canonicalThreadId']).trim();
      final clientJid = _readString(
        data['clientJid'],
        mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
      ).trim();
      final isLid = clientJid.endsWith('@lid');
      final targetThreadId = redirectTo.isNotEmpty ? redirectTo : canonicalThreadId;

      if (mounted) {
        setState(() {
          _threadClientJid = clientJid.isNotEmpty ? clientJid : null;
          _threadPhoneE164 = _readString(data['normalizedPhone']).trim().isNotEmpty
              ? _readString(data['normalizedPhone']).trim()
              : null;
          _threadDisplayName = _readString(data['displayName']).trim().isNotEmpty
              ? _readString(data['displayName']).trim()
              : null;
          if (targetThreadId.isNotEmpty) {
            _effectiveThreadIdOverride = targetThreadId;
          } else if ((_threadId ?? '').contains('[object Object]') &&
              _accountId != null &&
              clientJid.isNotEmpty) {
            _effectiveThreadIdOverride = '${_accountId}__$clientJid';
          }
        });
      }

      if ((isLid || redirectTo.isNotEmpty) &&
          targetThreadId.isNotEmpty &&
          targetThreadId != _threadId) {
        final targetDoc = await FirebaseFirestore.instance
            .collection('threads')
            .doc(targetThreadId)
            .get();
        if (!targetDoc.exists) {
          return;
        }

        final targetData = targetDoc.data() ?? <String, dynamic>{};
        final targetClientJid = _readString(
          targetData['clientJid'],
          mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
        ).trim();
        final targetPhone = _readString(targetData['normalizedPhone']).trim();
        final displayName = _readString(targetData['displayName']).trim();

        if (mounted) {
          final encodedDisplayName = Uri.encodeComponent(displayName);
          context.go(
            '/whatsapp/chat?accountId=${Uri.encodeComponent(_accountId!)}'
            '&threadId=${Uri.encodeComponent(targetThreadId)}'
            '&clientJid=${Uri.encodeComponent(targetClientJid)}'
            '&phoneE164=${Uri.encodeComponent(targetPhone)}'
            '&displayName=$encodedDisplayName',
          );
        }
      }
    } catch (e) {
      debugPrint('[ChatScreen] Redirect check failed: $e');
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message cannot be empty')),
      );
      return;
    }
    
    if (_isSending) return;
    if (_lastSendAt != null &&
        _lastSentText == text &&
        DateTime.now().difference(_lastSendAt!).inMilliseconds < 1500) {
      debugPrint('[ChatScreen] Skipping duplicate send (cooldown)');
      return;
    }
    
    if (_accountId == null || _effectiveThreadId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Missing required data: accountId=${_accountId ?? 'none'}, threadId=${_effectiveThreadId ?? 'none'}',
          ),
        ),
      );
      return;
    }

    _isSending = true;
    setState(() {});
    _lastSendAt = DateTime.now();
    _lastSentText = text;

    try {
      if (_threadClientJid == null || _threadClientJid!.isEmpty) {
        final refreshed = await FirebaseFirestore.instance
            .collection('threads')
            .doc(_effectiveThreadId!)
            .get();
        final refreshedData = refreshed.data() ?? <String, dynamic>{};
        final refreshedJid = _readString(
          refreshedData['clientJid'],
          mapKeys: const ['canonicalJid', 'jid', 'clientJid', 'remoteJid'],
        ).trim();
        if (mounted) {
          setState(() {
            _threadClientJid = refreshedJid.isNotEmpty ? refreshedJid : null;
          });
        }
      }

      if (_threadClientJid == null || _threadClientJid!.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Missing canonical clientJid for thread')),
        );
        return;
      }

      const uuid = Uuid();
      final clientMessageId = uuid.v4();
      final toJid = _threadClientJid!;

      final maskedAccount = _maskId(_accountId!);
      final maskedThread = _maskId(_effectiveThreadId!);
      final maskedJid = _maskId(toJid);
      debugPrint(
        '[ChatScreen] Sending message: account=$maskedAccount thread=$maskedThread jid=$maskedJid',
      );

      final result = await _apiService.sendViaProxy(
        threadId: _effectiveThreadId!,
        accountId: _accountId!,
        toJid: toJid,
        text: text,
        clientMessageId: clientMessageId,
      );

      debugPrint('[ChatScreen] Message sent successfully: $result');

      if (mounted) {
        _messageController.clear();
        _scrollToBottom(force: true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message sent!'), backgroundColor: Colors.green),
        );
      }

      if (_useApiMessages) {
        await _loadMessages();
      }
    } catch (e) {
      debugPrint('[ChatScreen] Error sending message: $e');
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error sending message: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  void _startApiPolling() {
    if (_messagePoller != null) return;
    _messagePoller = Timer.periodic(const Duration(seconds: 3), (_) {
      _loadMessages();
    });
    _loadMessages();
  }

  void _stopApiPolling() {
    _messagePoller?.cancel();
    _messagePoller = null;
  }

  void _enableApiMessages({String? reason}) {
    if (_useApiMessages) return;
    if (mounted) {
      setState(() {
        _useApiMessages = true;
      });
    }
    debugPrint('[ChatScreen] Live sync fallback -> polling${reason != null ? " ($reason)" : ""}');
    _startApiPolling();
  }

  void _disableApiMessages() {
    if (!_useApiMessages) return;
    if (mounted) {
      setState(() {
        _useApiMessages = false;
      });
    }
    _stopApiPolling();
  }

  void _markFirestoreHealthy() {
    if (_firestoreStreamHealthy) return;
    _firestoreStreamHealthy = true;
    _firestoreTimeoutTimer?.cancel();
    _disableApiMessages();
    debugPrint('[ChatScreen] Firestore stream healthy');
  }

  void _startFirestoreTimeoutWatchdog() {
    _firestoreTimeoutTimer?.cancel();
    _firestoreTimeoutTimer = Timer(const Duration(seconds: 10), () {
      if (!mounted) return;
      if (!_firestoreStreamHealthy && !_useApiMessages) {
        _enableApiMessages(reason: 'stream-timeout');
      }
    });
  }

  void _startFirestoreIdleWatchdog() {
    _firestoreIdleTimer?.cancel();
    _firestoreIdleTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!mounted) return;
      if (_useApiMessages) return;
      if (!_firestoreStreamHealthy) return;
      final last = _lastFirestoreSnapshotAt;
      if (last == null) return;
      final elapsed = DateTime.now().difference(last);
      if (elapsed.inSeconds >= 20) {
        _enableApiMessages(reason: 'stream-idle');
      }
    });
  }

  void _scheduleApiProbe() {
    _apiProbeTimer?.cancel();
    _apiProbeTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted) return;
      if (_useApiMessages) return;
      _loadMessages();
    });
  }

  Future<void> _loadMessages() async {
    if (_isLoadingMessages) return;
    final accountId = _accountId;
    final threadId = _effectiveThreadId;
    if (accountId == null || threadId == null || threadId.isEmpty) return;

    _isLoadingMessages = true;
    try {
      final response = await _apiService.getMessages(
        accountId: accountId,
        threadId: threadId,
        limit: _lastApiCursorMs == null ? 500 : 200,
        afterMs: _lastApiCursorMs,
        afterServerSeq: _lastApiServerSeq,
      );
      if (response['success'] == true) {
        final rawMessages = (response['messages'] as List<dynamic>? ?? [])
            .cast<Map<String, dynamic>>();
        final merged = _mergeApiMessages(rawMessages);
        if (mounted) {
          setState(() {
            _apiMessages = merged;
          });
        }
      }
    } catch (e) {
      debugPrint('[ChatScreen] Error loading messages via proxy: $e');
    } finally {
      _isLoadingMessages = false;
    }
  }

  void _scrollToBottom({bool force = false}) {
    if (!_scrollController.hasClients) return;
    final nearBottom = _scrollController.offset < 200;
    if (!force && !nearBottom) return;
    _scrollController.animateTo(
      _scrollController.position.minScrollExtent,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  int? _extractTsMillis(dynamic tsClientRaw) {
    if (tsClientRaw is Timestamp) {
      return tsClientRaw.millisecondsSinceEpoch;
    }
    if (tsClientRaw is String) {
      try {
        return DateTime.parse(tsClientRaw).millisecondsSinceEpoch;
      } catch (_) {
        return null;
      }
    }
    if (tsClientRaw is int) {
      return tsClientRaw;
    }
    return null;
  }

  int _extractSortMillis(Map<String, dynamic> data) {
    if (data['createdAtMs'] is int) {
      return data['createdAtMs'] as int;
    }
    return _extractTsMillis(data['tsClient']) ??
        _extractTsMillis(data['createdAt']) ??
        _extractTsMillis(data['tsServer']) ??
        0;
  }

  int? _extractServerSeq(Map<String, dynamic> data) {
    final raw = data['serverSeq'];
    if (raw is int) return raw;
    if (raw is String) {
      final parsed = int.tryParse(raw);
      return parsed;
    }
    return null;
  }

  void _updateApiCursor(List<Map<String, dynamic>> messages) {
    int? maxTs;
    int? maxSeq;
    for (final msg in messages) {
      final ts = _extractSortMillis(msg);
      if (ts > 0) {
        maxTs = maxTs == null ? ts : (ts > maxTs ? ts : maxTs);
      }
      final seq = _extractServerSeq(msg);
      if (seq != null) {
        maxSeq = maxSeq == null ? seq : (seq > maxSeq ? seq : maxSeq);
      }
    }
    _lastApiCursorMs = maxTs ?? _lastApiCursorMs;
    _lastApiServerSeq = maxSeq ?? _lastApiServerSeq;
  }

  List<Map<String, dynamic>> _mergeApiMessages(List<Map<String, dynamic>> incoming) {
    final combined = <Map<String, dynamic>>[];
    combined.addAll(_apiMessages);
    combined.addAll(incoming);
    final deduped = _dedupeMessageMaps(combined);
    _updateApiCursor(deduped);
    return deduped;
  }

  List<Map<String, dynamic>> _dedupeMessageMaps(List<Map<String, dynamic>> messages) {
    final byKey = <String, Map<String, dynamic>>{};
    int scoreMap(Map<String, dynamic> data) {
      int score = 0;
      if ((data['waMessageId'] as String?)?.isNotEmpty == true) score += 3;
      final status = data['status'] as String? ?? '';
      if (status == 'sent' || status == 'delivered' || status == 'read') score += 2;
      if (data['createdAtMs'] is int) score += 1;
      if ((data['clientMessageId'] as String?)?.isNotEmpty == true) score += 1;
      return score;
    }

    for (final data in messages) {
      if (data['isDuplicate'] == true) {
        continue;
      }
      final waMessageId = data['waMessageId'] as String?;
      final clientMessageId = data['clientMessageId'] as String?;
      final stableKeyHash = data['stableKeyHash'] as String?;
      final fingerprintHash = data['fingerprintHash'] as String?;
      final direction = data['direction'] as String? ?? 'inbound';
      final body = (data['body'] as String? ?? '').trim();
      final tsMillis = _extractTsMillis(data['tsClient']);
      final tsRounded = tsMillis != null ? (tsMillis / 1000).floor() : null;
      final fallbackKey = 'fallback:$direction|$body|$tsRounded';

      final primaryKey = stableKeyHash?.isNotEmpty == true
          ? 'stable:$stableKeyHash'
          : fingerprintHash?.isNotEmpty == true
              ? 'fp:$fingerprintHash'
              : waMessageId?.isNotEmpty == true
                  ? 'wa:$waMessageId'
                  : (clientMessageId?.isNotEmpty == true ? 'client:$clientMessageId' : fallbackKey);

      if (byKey.containsKey(primaryKey)) {
        final existing = byKey[primaryKey]!;
        if (scoreMap(data) > scoreMap(existing)) {
          byKey[primaryKey] = data;
        }
        continue;
      }

      final existing = byKey[fallbackKey];
      if (existing != null) {
        if (scoreMap(data) > scoreMap(existing)) {
          byKey[fallbackKey] = data;
        }
        continue;
      }

      byKey[primaryKey] = data;
    }

    final deduped = byKey.values.toList();
    deduped.sort((a, b) => _extractSortMillis(b).compareTo(_extractSortMillis(a)));
    return deduped;
  }

  List<QueryDocumentSnapshot> _dedupeMessageDocs(List<QueryDocumentSnapshot> docs) {
    final byKey = <String, QueryDocumentSnapshot>{};
    int scoreDoc(QueryDocumentSnapshot doc) {
      final data = doc.data() as Map<String, dynamic>;
      int score = 0;
      if ((data['waMessageId'] as String?)?.isNotEmpty == true) score += 3;
      final status = data['status'] as String? ?? '';
      if (status == 'sent' || status == 'delivered' || status == 'read') score += 2;
      if (data['createdAtMs'] is int) score += 1;
      if ((data['clientMessageId'] as String?)?.isNotEmpty == true) score += 1;
      return score;
    }
    for (final doc in docs) {
      final data = doc.data() as Map<String, dynamic>;
      if (data['isDuplicate'] == true) {
        continue;
      }
      final waMessageId = data['waMessageId'] as String?;
      final clientMessageId = data['clientMessageId'] as String?;
      final stableKeyHash = data['stableKeyHash'] as String?;
      final fingerprintHash = data['fingerprintHash'] as String?;
      final direction = data['direction'] as String? ?? 'inbound';
      final body = (data['body'] as String? ?? '').trim();
      final tsMillis = _extractTsMillis(data['tsClient']);
      final tsRounded = tsMillis != null ? (tsMillis / 1000).floor() : null;
      final fallbackKey = 'fallback:$direction|$body|$tsRounded';

      final primaryKey = stableKeyHash?.isNotEmpty == true
          ? 'stable:$stableKeyHash'
          : fingerprintHash?.isNotEmpty == true
              ? 'fp:$fingerprintHash'
              : waMessageId?.isNotEmpty == true
          ? 'wa:$waMessageId'
          : (clientMessageId?.isNotEmpty == true ? 'client:$clientMessageId' : fallbackKey);

      if (byKey.containsKey(primaryKey)) {
        final existing = byKey[primaryKey]!;
        if (scoreDoc(doc) > scoreDoc(existing)) {
          byKey[primaryKey] = doc;
        }
        continue;
      }

      final existing = byKey[fallbackKey];
      if (existing != null) {
        final existingData = existing.data() as Map<String, dynamic>;
        final existingHasWa = (existingData['waMessageId'] as String?)?.isNotEmpty == true;
        final currentHasWa = waMessageId?.isNotEmpty == true;
        if (existingHasWa && !currentHasWa) {
          continue;
        }
        if (!existingHasWa && currentHasWa) {
          byKey[fallbackKey] = doc;
          byKey[primaryKey] = doc;
          continue;
        }
      }

      byKey[primaryKey] = doc;
      byKey.putIfAbsent(fallbackKey, () => doc);
    }
    final deduped = byKey.values.toList();
    deduped.sort((a, b) {
      final aData = a.data() as Map<String, dynamic>;
      final bData = b.data() as Map<String, dynamic>;
      final aSort = _extractSortMillis(aData);
      final bSort = _extractSortMillis(bData);
      if (aSort != bSort) {
        return bSort.compareTo(aSort); // Descending (newest first)
      }
      return a.id.compareTo(b.id);
    });
    return deduped;
  }

  Widget _buildMessageListFromMaps(List<Map<String, dynamic>> messages, String threadKey) {
    if (messages.isEmpty) {
      return const Center(child: Text('No messages yet'));
    }

    final currentMessageCount = messages.length;
    final hasNewMessages = currentMessageCount > _previousMessageCount;

    if (!_initialScrollDone && messages.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToBottom(force: true);
      });
      _initialScrollDone = true;
    } else if (hasNewMessages) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToBottom();
      });
    }
    _previousMessageCount = currentMessageCount;

    return ListView.builder(
      controller: _scrollController,
      key: PageStorageKey('whatsapp-chat-$threadKey'),
      reverse: true,
      padding: const EdgeInsets.all(16),
      itemCount: messages.length,
      itemBuilder: (context, index) {
        final data = messages[index];
        final messageKey = data['waMessageId'] as String? ??
            data['clientMessageId'] as String? ??
            data['id'] as String? ??
            '$index';

        final direction = data['direction'] as String? ?? 'inbound';
        final body = data['body'] as String? ?? '';
        final status = data['status'] as String?;

        Timestamp? tsClient;
        final tsClientRaw = data['tsClient'];
        if (tsClientRaw is Timestamp) {
          tsClient = tsClientRaw;
        } else if (tsClientRaw is String) {
          try {
            final dateTime = DateTime.parse(tsClientRaw);
            tsClient = Timestamp.fromDate(dateTime);
          } catch (_) {
            tsClient = null;
          }
        } else if (tsClientRaw is int) {
          tsClient = Timestamp.fromMillisecondsSinceEpoch(tsClientRaw);
        }

        final isOutbound = direction == 'outbound';

        String timeText = '';
        if (tsClient != null) {
          final now = DateTime.now();
          final msgTime = tsClient.toDate();
          final diff = now.difference(msgTime);

          if (diff.inDays == 0) {
            timeText = DateFormat('HH:mm').format(msgTime);
          } else if (diff.inDays == 1) {
            timeText = 'Ieri ${DateFormat('HH:mm').format(msgTime)}';
          } else if (diff.inDays < 7) {
            timeText = DateFormat('EEE HH:mm').format(msgTime);
          } else {
            timeText = DateFormat('dd/MM/yyyy HH:mm').format(msgTime);
          }
        }

        return KeyedSubtree(
          key: ValueKey(messageKey),
          child: Align(
            alignment: isOutbound ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              margin: const EdgeInsets.only(bottom: 4, left: 48, right: 48),
              child: Row(
                mainAxisAlignment: isOutbound ? MainAxisAlignment.end : MainAxisAlignment.start,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (!isOutbound) ...[
                    CircleAvatar(
                      radius: 14,
                      backgroundColor: Colors.grey[300],
                      child: Icon(Icons.person, size: 16, color: Colors.grey[700]),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: isOutbound ? const Color(0xFFDCF8C6) : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: const [
                          BoxShadow(color: Colors.black12, blurRadius: 1, offset: Offset(0, 1)),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment:
                            isOutbound ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                        children: [
                          Text(
                            body,
                            style: const TextStyle(fontSize: 15),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (timeText.isNotEmpty)
                                Text(
                                  timeText,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isOutbound ? Colors.white70 : Colors.grey[600],
                                  ),
                                ),
                              if (isOutbound && status != null) ...[
                                const SizedBox(width: 4),
                                Text(
                                  _getStatusIcon(status),
                                  style: const TextStyle(fontSize: 12),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (isOutbound) ...[
                    const SizedBox(width: 48),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _extractEvent() async {
    if (_effectiveThreadId == null || _accountId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ThreadId and AccountId are required')),
      );
      return;
    }

    setState(() => _showCrmPanel = true);

    try {
      final result = await _apiService.extractEventFromThread(
        threadId: _effectiveThreadId!,
        accountId: _accountId!,
        phoneE164: _phoneE164,
        dryRun: true,
      );

      if (mounted) {
        if (result['action'] == 'NOOP') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result['reasons']?.join(', ') ?? 'No booking intent detected'),
              backgroundColor: Colors.orange,
            ),
          );
        } else {
          setState(() {
            _draftEvent = result['draftEvent'] as Map<String, dynamic>?;
          });
          _showEventDraftDialog();
        }
      }
    } catch (e) {
      if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error extracting event: $e')),
          );
      }
    }
  }

  Future<void> _saveEvent(Map<String, dynamic> eventData) async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw Exception('User not authenticated');
      }

      final firestore = FirebaseFirestore.instance;
      
      await firestore.collection('evenimente').add({
        'createdBy': user.uid,
        'accountId': _accountId,
        'threadId': _threadId,
        'phoneE164': _phoneE164 ?? _extractPhoneFromJid(_clientJid),
        'phoneRaw': _phoneE164?.replaceAll('+', '') ?? _extractPhoneFromJid(_clientJid)?.replaceAll('+', ''),
        'isArchived': false,
        'schemaVersion': 3,
        'date': eventData['date'],
        'address': eventData['address'],
        'childName': eventData['childName'],
        'childAge': eventData['childAge'],
        'payment': eventData['payment'] ?? {'status': 'UNPAID'},
        'rolesBySlot': eventData['rolesBySlot'] ?? {},
        'createdAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Event saved successfully!')),
        );
        setState(() {
          _draftEvent = null;
          _showCrmPanel = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving event: $e')),
        );
      }
    }
  }

  String? _extractPhoneFromJid(String? jid) {
    if (jid == null) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0];
    return digits.startsWith('+') ? digits : '+$digits';
  }

  void _showEventDraftDialog() {
    if (_draftEvent == null) return;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Event Draft'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_draftEvent!['date'] != null)
                Text('Date: ${_draftEvent!['date']}'),
              if (_draftEvent!['address'] != null)
                Text('Address: ${_draftEvent!['address']}'),
              if (_draftEvent!['childName'] != null)
                Text('Child: ${_draftEvent!['childName']}'),
              if (_draftEvent!['payment'] != null)
                Text('Payment: ${_draftEvent!['payment']}'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              _saveEvent(_draftEvent!);
            },
            child: const Text('Save Event'),
          ),
        ],
      ),
    );
  }

  String _getStatusIcon(String? status) {
    switch (status?.toLowerCase()) {
      case 'queued':
        return '⏳';
      case 'sent':
        return '✓';
      case 'delivered':
        return '✓✓';
      case 'read':
        return '✓✓✓';
      default:
        return '';
    }
  }

  // Get display name from thread or clientJid
  String get displayName {
    if (_displayName != null && _displayName!.trim().isNotEmpty) {
      return _displayName!.trim();
    }
    // Try to extract a readable name from clientJid first
    if (_clientJid != null) {
      final jidPart = _clientJid!.split('@')[0];
      // If it's not just a phone number (has letters), use it
      if (jidPart.contains(RegExp(r'[a-zA-Z]'))) {
        return jidPart;
      }
    }
    
    // Otherwise, try to format phone number nicely
    final phone = _phoneE164 ?? _extractPhoneFromJid(_clientJid);
    if (phone != null) {
      // Format phone number: +40 123 456 789
      return phone.replaceAllMapped(
        RegExp(r'^\+(\d{1,3})(\d{3})(\d{3})(\d+)$'),
        (match) => '+${match[1]} ${match[2]} ${match[3]} ${match[4]}',
      );
    }
    
    return 'Unknown';
  }

  @override
  Widget build(BuildContext context) {
    if (_threadId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Chat')),
        body: const Center(child: Text('ThreadId is required')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            // Navigate back to WhatsApp inbox
            context.go('/whatsapp/inbox');
          },
        ),
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: Colors.white.withOpacity(0.3),
              child: Text(
                getDisplayInitial(displayName),
                style: const TextStyle(color: Colors.white),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    displayName,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  if (_phoneE164 != null || _extractPhoneFromJid(_clientJid) != null)
                    Text(
                      _phoneE164 ?? _extractPhoneFromJid(_clientJid) ?? '',
                      style: const TextStyle(fontSize: 12, color: Colors.white70),
                    ),
                ],
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          IconButton(
            icon: Icon(_showCrmPanel ? Icons.expand_less : Icons.expand_more),
            onPressed: () {
              setState(() => _showCrmPanel = !_showCrmPanel);
            },
            tooltip: 'Toggle CRM Panel',
          ),
        ],
      ),
      body: Column(
        children: [
          // CRM Panel (collapsible)
          if (_showCrmPanel)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _extractEvent,
                      icon: const Icon(Icons.auto_awesome, size: 18),
                      label: const Text('Extract Event'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (_phoneE164 != null || _extractPhoneFromJid(_clientJid) != null)
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          final phone = _phoneE164 ?? _extractPhoneFromJid(_clientJid);
                          if (phone != null) {
                            context.go('/whatsapp/client?phoneE164=${Uri.encodeComponent(phone)}');
                          }
                        },
                        icon: const Icon(Icons.person, size: 18),
                        label: const Text('Client Profile'),
                      ),
                    ),
                ],
              ),
            ),

          // Messages list
          Expanded(
            child: Builder(
              builder: (context) {
                final effectiveThreadId = _effectiveThreadId;
                if (effectiveThreadId == null || effectiveThreadId.isEmpty) {
                  return const Center(child: Text('Missing thread data'));
                }

                return StreamBuilder<QuerySnapshot>(
                  stream: FirebaseFirestore.instance
                      .collection('threads')
                      .doc(effectiveThreadId)
                      .collection('messages')
                      .orderBy('createdAt', descending: true)
                      .limit(500)
                      .snapshots(),
                  builder: (context, snapshot) {
                
                if (snapshot.connectionState == ConnectionState.waiting) {
                  if (_useApiMessages) {
                    return _buildMessageListFromMaps(_apiMessages, effectiveThreadId);
                  }
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _firestoreStreamHealthy = false;
                    _enableApiMessages(reason: 'stream-error');
                  });
                  return _buildMessageListFromMaps(_apiMessages, effectiveThreadId);
                }

                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  if (_useApiMessages) {
                    return _buildMessageListFromMaps(_apiMessages, effectiveThreadId);
                  }
                  return const Center(child: Text('No messages yet'));
                }

                WidgetsBinding.instance.addPostFrameCallback((_) {
                  _lastFirestoreSnapshotAt = DateTime.now();
                  _markFirestoreHealthy();
                });

                final dedupedDocs = _dedupeMessageDocs(snapshot.data!.docs);
                final currentMessageCount = dedupedDocs.length;
                final hasNewMessages = currentMessageCount > _previousMessageCount;
                
                if (!_initialScrollDone && dedupedDocs.isNotEmpty) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _scrollToBottom(force: true);
                  });
                  _initialScrollDone = true;
                } else if (hasNewMessages) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _scrollToBottom();
                  });
                }
                _previousMessageCount = currentMessageCount;

                return ListView.builder(
                  controller: _scrollController,
                  key: PageStorageKey('whatsapp-chat-${effectiveThreadId}'),
                  reverse: true,
                  padding: const EdgeInsets.all(16),
                  itemCount: dedupedDocs.length,
                  itemBuilder: (context, index) {
                    
                    final doc = dedupedDocs[index];
                    final data = doc.data() as Map<String, dynamic>;
                    final messageKey = data['waMessageId'] as String? ??
                        data['clientMessageId'] as String? ??
                        doc.id;
                    
                    final direction = data['direction'] as String? ?? 'inbound';
                    final body = data['body'] as String? ?? '';
                    final status = data['status'] as String?;
                    
                    // Handle tsClient - it might be a Timestamp, String, or int
                    Timestamp? tsClient;
                    final tsClientRaw = data['tsClient'];
                    if (tsClientRaw is Timestamp) {
                      tsClient = tsClientRaw;
                    } else if (tsClientRaw is String) {
                      try {
                        // Try parsing ISO8601 string
                        final dateTime = DateTime.parse(tsClientRaw);
                        tsClient = Timestamp.fromDate(dateTime);
                      } catch (e) {
                        // If parsing fails, tsClient remains null
                        tsClient = null;
                      }
                    } else if (tsClientRaw is int) {
                      // Unix timestamp in milliseconds
                      tsClient = Timestamp.fromMillisecondsSinceEpoch(tsClientRaw);
                    }

                    final isOutbound = direction == 'outbound';

                    // Format timestamp
                    String timeText = '';
                    if (tsClient != null) {
                      final now = DateTime.now();
                      final msgTime = tsClient.toDate();
                      final diff = now.difference(msgTime);
                      
                      if (diff.inDays == 0) {
                        // Today - show only time
                        timeText = DateFormat('HH:mm').format(msgTime);
                      } else if (diff.inDays == 1) {
                        // Yesterday
                        timeText = 'Ieri ${DateFormat('HH:mm').format(msgTime)}';
                      } else if (diff.inDays < 7) {
                        // This week - show day name
                        timeText = DateFormat('EEE HH:mm').format(msgTime);
                      } else {
                        // Older - show date
                        timeText = DateFormat('dd/MM/yyyy HH:mm').format(msgTime);
                      }
                    }
                    
                    return KeyedSubtree(
                      key: ValueKey(messageKey),
                      child: Align(
                        alignment: isOutbound ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 4, left: 48, right: 48),
                          child: Row(
                            mainAxisAlignment: isOutbound ? MainAxisAlignment.end : MainAxisAlignment.start,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              // Avatar for inbound messages (left side)
                              if (!isOutbound) ...[
                                CircleAvatar(
                                  radius: 16,
                                  backgroundColor: Colors.grey[300],
                                  child: Text(
                                    getDisplayInitial(displayName),
                                    style: const TextStyle(fontSize: 12, color: Colors.black87),
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              // Message bubble
                              Flexible(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  constraints: BoxConstraints(
                                    maxWidth: MediaQuery.of(context).size.width * 0.65,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isOutbound ? const Color(0xFF25D366) : Colors.white,
                                    borderRadius: BorderRadius.only(
                                      topLeft: const Radius.circular(8),
                                      topRight: const Radius.circular(8),
                                      bottomLeft: Radius.circular(isOutbound ? 8 : 0),
                                      bottomRight: Radius.circular(isOutbound ? 0 : 8),
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withOpacity(0.05),
                                        blurRadius: 1,
                                        offset: const Offset(0, 1),
                                      ),
                                    ],
                                    border: isOutbound ? null : Border.all(color: Colors.grey[200]!),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        body,
                                        style: TextStyle(
                                          color: isOutbound ? Colors.white : Colors.black87,
                                          fontSize: 15,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          if (timeText.isNotEmpty)
                                            Text(
                                              timeText,
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: isOutbound ? Colors.white70 : Colors.grey[600],
                                              ),
                                            ),
                                          if (isOutbound && status != null) ...[
                                            const SizedBox(width: 4),
                                            Text(
                                              _getStatusIcon(status),
                                              style: const TextStyle(fontSize: 12),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              // Spacing for outbound messages (before avatar area)
                              if (isOutbound) ...[
                                const SizedBox(width: 48), // Match avatar width for alignment
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
                  },
                );
              },
            ),
          ),

          // Send input
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: Colors.grey[300]!)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _isSending ? null : _sendMessage,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366),
                    padding: const EdgeInsets.all(12),
                  ),
                  child: _isSending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send, color: Colors.white),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
