import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:video_player/video_player.dart';
import 'package:just_audio/just_audio.dart';

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
  int _previousMessageCount = 0; // Track message count to detect new messages
  DateTime? _lastSendAt;
  String? _lastSentText;
  bool _initialScrollDone = false;
  bool _redirectChecked = false;
  String? _threadClientJid;
  String? _threadPhoneE164;
  String? _threadDisplayName;
  String? _threadProfilePictureUrl;
  String? _effectiveThreadIdOverride;
  
  // Media players - one per message
  final Map<String, VideoPlayerController> _videoControllers = {};
  final Map<String, AudioPlayer> _audioPlayers = {};
  final Map<String, bool> _videoPlaying = {};
  final Map<String, bool> _audioPlaying = {};
  final Map<String, bool> _videoInitializing = {}; // Track initialization state
  final Map<String, bool> _audioInitializing = {}; // Track initialization state
  
  // Listen to video player state changes
  void _setupVideoPlayerListener(String messageKey, VideoPlayerController controller) {
    controller.addListener(() {
      if (mounted && controller.value.isPlaying != (_videoPlaying[messageKey] ?? false)) {
        // Use SchedulerBinding to avoid blocking UI during build
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            setState(() {
              _videoPlaying[messageKey] = controller.value.isPlaying;
            });
          }
        });
      }
    });
  }
  
  // Listen to audio player state changes
  void _setupAudioPlayerListener(String messageKey, AudioPlayer player) {
    player.playerStateStream.listen((state) {
      if (mounted) {
        final isPlaying = state.playing;
        if (isPlaying != (_audioPlaying[messageKey] ?? false)) {
          // Use SchedulerBinding to avoid blocking UI during build
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() {
                _audioPlaying[messageKey] = isPlaying;
              });
            }
          });
        }
      }
    });
  }
  
  // Initialize video player asynchronously (lazy, on-demand)
  Future<VideoPlayerController?> _initializeVideoPlayer(String messageKey, String videoUrl) async {
    if (_videoControllers.containsKey(messageKey)) {
      return _videoControllers[messageKey]; // Already initialized
    }
    
    if (_videoInitializing[messageKey] == true) {
      return null; // Already initializing, return null to show loading
    }
    
    _videoInitializing[messageKey] = true;
    
    try {
      // Create controller asynchronously - this is non-blocking
      final controller = VideoPlayerController.networkUrl(Uri.parse(videoUrl));
      _videoControllers[messageKey] = controller;
      _setupVideoPlayerListener(messageKey, controller);
      
      // Initialize on background - this may take time but won't block UI
      await controller.initialize();
      
      // Update state only once after initialization completes
      if (mounted) {
        _videoInitializing[messageKey] = false;
        // Use microtask to avoid blocking during build
        Future.microtask(() {
          if (mounted) {
            setState(() {});
          }
        });
      }
      
      return controller;
    } catch (e) {
      debugPrint('Video initialization error: $e');
      _videoControllers.remove(messageKey);
      if (mounted) {
        _videoInitializing[messageKey] = false;
        Future.microtask(() {
          if (mounted) {
            setState(() {});
          }
        });
      }
      return null;
    }
  }
  
  // Initialize audio player asynchronously (lazy, on-demand)
  Future<AudioPlayer?> _initializeAudioPlayer(String messageKey, String audioUrl) async {
    if (_audioPlayers.containsKey(messageKey)) {
      return _audioPlayers[messageKey]; // Already initialized
    }
    
    if (_audioInitializing[messageKey] == true) {
      return null; // Already initializing, return null to show loading
    }
    
    _audioInitializing[messageKey] = true;
    
    try {
      final player = AudioPlayer();
      _audioPlayers[messageKey] = player;
      _setupAudioPlayerListener(messageKey, player);
      
      // Load URL asynchronously - this is non-blocking
      await player.setUrl(audioUrl);
      
      // Update state only once after initialization completes
      if (mounted) {
        _audioInitializing[messageKey] = false;
        // Use microtask to avoid blocking during build
        Future.microtask(() {
          if (mounted) {
            setState(() {});
          }
        });
      }
      
      return player;
    } catch (e) {
      debugPrint('Audio load error: $e');
      _audioPlayers.remove(messageKey);
      if (mounted) {
        _audioInitializing[messageKey] = false;
        Future.microtask(() {
          if (mounted) {
            setState(() {});
          }
        });
      }
      return null;
    }
  }

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
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    // Dispose video controllers
    for (final controller in _videoControllers.values) {
      controller.dispose();
    }
    _videoControllers.clear();
    // Dispose audio players
    for (final player in _audioPlayers.values) {
      player.dispose();
    }
    _audioPlayers.clear();
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
          _threadProfilePictureUrl = _readString(data['profilePictureUrl'] ?? data['photoUrl']).trim().isNotEmpty
              ? _readString(data['profilePictureUrl'] ?? data['photoUrl']).trim()
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

  // Build video player widget
  Widget _buildVideoPlayer(String messageKey, Map<String, dynamic> media, bool isOutbound) {
    final videoUrl = media['url'] as String?;
    if (videoUrl == null || videoUrl.isEmpty) {
      return Container(
        height: 200,
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Text(
            'Video not available',
            style: TextStyle(color: Colors.white70, fontSize: 12),
          ),
        ),
      );
    }

    // Use FutureBuilder to handle initialization without blocking UI
    return FutureBuilder<VideoPlayerController?>(
      future: _videoControllers.containsKey(messageKey)
          ? Future.value(_videoControllers[messageKey])
          : _initializeVideoPlayer(messageKey, videoUrl),
      builder: (context, snapshot) {
        final controller = snapshot.data;
        final isInitialized = controller != null && controller.value.isInitialized;
        final isInitializing = snapshot.connectionState == ConnectionState.waiting || 
                              _videoInitializing[messageKey] == true;
        final isPlaying = _videoPlaying[messageKey] ?? false;

        return Container(
          height: 200,
          decoration: BoxDecoration(
            color: Colors.black87,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Video player or thumbnail
              if (isInitialized && controller != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    width: double.infinity,
                    height: 200,
                    child: FittedBox(
                      fit: BoxFit.cover,
                      child: SizedBox(
                        width: controller.value.size.width,
                        height: controller.value.size.height,
                        child: VideoPlayer(controller),
                      ),
                    ),
                  ),
                )
              else
                Builder(
                  builder: (context) {
                    // Show thumbnail if available while initializing
                    if (!isInitializing) {
                      try {
                        final thumbBase64 = media['thumbBase64'] as String?;
                        if (thumbBase64 != null && thumbBase64.isNotEmpty) {
                          return ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.memory(
                              base64Decode(thumbBase64),
                              width: double.infinity,
                              height: 200,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return Container(
                                  height: 200,
                                  color: Colors.black87,
                                  child: const Center(
                                    child: CircularProgressIndicator(color: Colors.white),
                                  ),
                                );
                              },
                            ),
                          );
                        }
                      } catch (e) {
                        // Ignore decode errors
                      }
                    }
                    // Show loading indicator while initializing
                    return Container(
                      height: 200,
                      color: Colors.black87,
                      child: const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      ),
                    );
                  },
                ),
              // Play/pause button overlay (only show when not playing or when video is not initialized)
              if (!isInitialized || !isPlaying)
                Container(
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.3),
                    shape: BoxShape.circle,
                  ),
                  child: IconButton(
                    icon: const Icon(
                      Icons.play_circle_filled,
                      size: 48,
                      color: Colors.white,
                    ),
                    onPressed: () {
                      if (isInitialized && controller != null) {
                        controller.play();
                        // Use microtask to avoid blocking during build
                        Future.microtask(() {
                          if (mounted) {
                            setState(() {
                              _videoPlaying[messageKey] = true;
                            });
                          }
                        });
                      }
                    },
                  ),
                )
              else if (controller != null)
                // Show pause button when playing
                GestureDetector(
                  onTap: () {
                    controller.pause();
                    // Use microtask to avoid blocking during build
                    Future.microtask(() {
                      if (mounted) {
                        setState(() {
                          _videoPlaying[messageKey] = false;
                        });
                      }
                    });
                  },
                  child: Container(
                    color: Colors.transparent,
                    width: double.infinity,
                    height: 200,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  // Build audio player widget
  Widget _buildAudioPlayer(String messageKey, Map<String, dynamic> media, bool isOutbound) {
    final audioUrl = media['url'] as String?;
    if (audioUrl == null || audioUrl.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.grey[200],
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(
              Icons.audiotrack,
              color: isOutbound ? Colors.white70 : Colors.grey[700],
              size: 24,
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Audio not available',
                style: TextStyle(fontSize: 14),
              ),
            ),
          ],
        ),
      );
    }

    // Use FutureBuilder to handle initialization without blocking UI
    return FutureBuilder<AudioPlayer?>(
      future: _audioPlayers.containsKey(messageKey)
          ? Future.value(_audioPlayers[messageKey])
          : _initializeAudioPlayer(messageKey, audioUrl),
      builder: (context, snapshot) {
        final player = snapshot.data;
        final isInitializing = snapshot.connectionState == ConnectionState.waiting || 
                             _audioInitializing[messageKey] == true;
        final isPlaying = _audioPlaying[messageKey] ?? false;

        // Show loading state while initializing
        if (player == null || isInitializing) {
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isOutbound ? Colors.grey[800] : Colors.grey[200],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.audiotrack,
                  color: isOutbound ? Colors.white70 : Colors.grey[700],
                  size: 24,
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Loading audio...',
                    style: TextStyle(fontSize: 14),
                  ),
                ),
              ],
            ),
          );
        }

        return StreamBuilder<Duration?>(
          stream: player.durationStream,
          builder: (context, durationSnapshot) {
            return StreamBuilder<Duration>(
              stream: player.positionStream,
              builder: (context, positionSnapshot) {
                final duration = durationSnapshot.data ?? Duration.zero;
                final position = positionSnapshot.data ?? Duration.zero;
                final durationText = duration.inSeconds > 0
                    ? '${duration.inMinutes}:${(duration.inSeconds % 60).toString().padLeft(2, '0')}'
                    : '';
                final positionText = position.inSeconds > 0
                    ? '${position.inMinutes}:${(position.inSeconds % 60).toString().padLeft(2, '0')}'
                    : '0:00';

                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isOutbound ? Colors.grey[800] : Colors.grey[200],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: Icon(
                          isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
                          color: isOutbound ? Colors.white : Colors.blue[700],
                          size: 32,
                        ),
                        onPressed: () async {
                          // Use microtask to avoid blocking during build
                          Future.microtask(() {
                            if (mounted) {
                              setState(() {
                                if (isPlaying) {
                                  player.pause();
                                  _audioPlaying[messageKey] = false;
                                } else {
                                  player.play();
                                  _audioPlaying[messageKey] = true;
                                }
                              });
                            }
                          });
                        },
                      ),
                  const SizedBox(width: 8),
                  Icon(
                    Icons.audiotrack,
                    color: isOutbound ? Colors.white70 : Colors.grey[700],
                    size: 24,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Audio message',
                          style: TextStyle(
                            color: isOutbound ? Colors.white : Colors.black87,
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        if (duration.inSeconds > 0)
                          Row(
                            children: [
                              Text(
                                positionText,
                                style: TextStyle(
                                  color: isOutbound ? Colors.white70 : Colors.grey[600],
                                  fontSize: 11,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: LinearProgressIndicator(
                                  value: duration.inSeconds > 0
                                      ? position.inSeconds / duration.inSeconds
                                      : 0,
                                  backgroundColor: isOutbound ? Colors.white24 : Colors.grey[300],
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    isOutbound ? Colors.white70 : (Colors.blue[700] ?? Colors.blue),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                durationText,
                                style: TextStyle(
                                  color: isOutbound ? Colors.white70 : Colors.grey[600],
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          )
                        else if (media['mimetype'] != null)
                          Text(
                            media['mimetype'] as String,
                            style: TextStyle(
                              color: isOutbound ? Colors.white70 : Colors.grey[600],
                              fontSize: 11,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
      },
    );
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
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Missing canonical clientJid for thread')),
        );
        return;
      }

      final clientMessageId = Uuid().v4();
      final toJid = _threadClientJid!;

      final maskedAccount = _maskId(_accountId!);
      final maskedThread = _maskId(_effectiveThreadId!);
      final maskedJid = _maskId(toJid);
      debugPrint(
        '[ChatScreen] Sending via proxy: account=$maskedAccount thread=$maskedThread jid=$maskedJid',
      );

      await _apiService.sendViaProxy(
        threadId: _effectiveThreadId!,
        accountId: _accountId!,
        toJid: toJid,
        text: text,
        clientMessageId: clientMessageId,
      );

      if (mounted) {
        _messageController.clear();
        _scrollToBottom(force: true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message sent!'), backgroundColor: Colors.green),
        );
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

  List<QueryDocumentSnapshot> _dedupeMessageDocs(List<QueryDocumentSnapshot> docs) {
    final byKey = <String, QueryDocumentSnapshot>{};
    int scoreDoc(QueryDocumentSnapshot doc) {
      final data = doc.data() as Map<String, dynamic>;
      int score = 0;
      if ((data['providerMessageId'] as String?)?.isNotEmpty == true) score += 4;
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
      final providerMessageId = data['providerMessageId'] as String?;
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
              : providerMessageId?.isNotEmpty == true
                  ? 'provider:$providerMessageId'
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
            // Show profile picture if available, otherwise show initial
            _threadProfilePictureUrl != null && _threadProfilePictureUrl!.isNotEmpty
                ? CircleAvatar(
                    radius: 18,
                    backgroundColor: Colors.white.withOpacity(0.3),
                    backgroundImage: CachedNetworkImageProvider(_threadProfilePictureUrl!),
                    onBackgroundImageError: (exception, stackTrace) {
                      // Image failed to load - will show fallback child
                    },
                    child: Text(
                      getDisplayInitial(displayName),
                      style: const TextStyle(color: Colors.white),
                    ),
                  )
                : CircleAvatar(
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
                      .orderBy('tsClient', descending: true)
                      .limit(200)
                      .snapshots(),
                  builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'Stream error: ${snapshot.error}',
                        style: TextStyle(color: Colors.red[700]),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }
                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  return const Center(child: Text('No messages yet'));
                }

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
                    final media = data['media'] as Map<String, dynamic>?;
                    // Extract sender name - try multiple fields
                    final senderName = data['senderName'] as String? ?? 
                                     data['lastSenderName'] as String? ??
                                     (data['key'] is Map ? (data['key'] as Map)['participant'] as String? : null);
                    // Check if this is a group message (clientJid ends with @g.us)
                    final clientJidForMessage = data['clientJid'] as String? ?? _clientJid;
                    final isGroupMessage = (clientJidForMessage?.endsWith('@g.us') ?? false) ||
                                          (_clientJid?.endsWith('@g.us') ?? false);
                    
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
                                      // Show sender name for group messages (inbound only)
                                      if (!isOutbound && isGroupMessage && senderName != null && senderName.isNotEmpty && senderName != 'me') ...[
                                        Padding(
                                          padding: const EdgeInsets.only(bottom: 4),
                                          child: Text(
                                            senderName,
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: isOutbound ? Colors.white70 : Colors.blue[700],
                                            ),
                                          ),
                                        ),
                                      ],
                                      // Show media based on type
                                      if (media != null) ...[
                                        if (media['type'] == 'image') ...[
                                          if (media['url'] != null)
                                            ClipRRect(
                                              borderRadius: BorderRadius.circular(8),
                                              child: Image.network(
                                                media['url'] as String,
                                                width: double.infinity,
                                                fit: BoxFit.cover,
                                                errorBuilder: (context, error, stackTrace) {
                                                  return Container(
                                                    height: 200,
                                                    color: Colors.grey[300],
                                                    child: const Center(
                                                      child: Icon(Icons.broken_image, color: Colors.grey),
                                                    ),
                                                  );
                                                },
                                                loadingBuilder: (context, child, loadingProgress) {
                                                  if (loadingProgress == null) return child;
                                                  return Container(
                                                    height: 200,
                                                    color: Colors.grey[200],
                                                    child: const Center(
                                                      child: CircularProgressIndicator(),
                                                    ),
                                                  );
                                                },
                                              ),
                                            )
                                          else
                                            Container(
                                              height: 200,
                                              color: Colors.grey[300],
                                              child: const Center(
                                                child: Icon(Icons.image, color: Colors.grey),
                                              ),
                                            ),
                                          if (body.isNotEmpty) const SizedBox(height: 8),
                                        ] else if (media['type'] == 'video') ...[
                                          _buildVideoPlayer(messageKey, media, isOutbound),
                                          if (body.isNotEmpty) const SizedBox(height: 8),
                                        ] else if (media['type'] == 'audio') ...[
                                          _buildAudioPlayer(messageKey, media, isOutbound),
                                          if (body.isNotEmpty) const SizedBox(height: 8),
                                        ] else if (media['type'] == 'document') ...[
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                            decoration: BoxDecoration(
                                              color: Colors.grey[200],
                                              borderRadius: BorderRadius.circular(8),
                                            ),
                                            child: Row(
                                              children: [
                                                Icon(
                                                  Icons.insert_drive_file,
                                                  color: isOutbound ? Colors.white70 : Colors.grey[700],
                                                  size: 24,
                                                ),
                                                const SizedBox(width: 12),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment: CrossAxisAlignment.start,
                                                    children: [
                                                      Text(
                                                        media['filename'] as String? ?? 'Document',
                                                        style: TextStyle(
                                                          color: isOutbound ? Colors.white : Colors.black87,
                                                          fontSize: 14,
                                                          fontWeight: FontWeight.w500,
                                                        ),
                                                        maxLines: 1,
                                                        overflow: TextOverflow.ellipsis,
                                                      ),
                                                      if (media['mimetype'] != null)
                                                        Text(
                                                          media['mimetype'] as String,
                                                          style: TextStyle(
                                                            color: isOutbound ? Colors.white70 : Colors.grey[600],
                                                            fontSize: 11,
                                                          ),
                                                        ),
                                                    ],
                                                  ),
                                                ),
                                                IconButton(
                                                  icon: Icon(
                                                    Icons.download,
                                                    color: isOutbound ? Colors.white : Colors.blue[700],
                                                  ),
                                                  onPressed: () async {
                                                    final url = media['url'] as String?;
                                                    if (url != null) {
                                                      final uri = Uri.parse(url);
                                                      if (await canLaunchUrl(uri)) {
                                                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                                                      }
                                                    }
                                                  },
                                                ),
                                              ],
                                            ),
                                          ),
                                          if (body.isNotEmpty) const SizedBox(height: 8),
                                        ],
                                      ],
                                      // Show text body if present
                                      if (body.isNotEmpty)
                                        Text(
                                          body,
                                          style: TextStyle(
                                            color: isOutbound ? Colors.white : Colors.black87,
                                            fontSize: 15,
                                          ),
                                        ),
                                      if (body.isNotEmpty || (media != null && media['type'] != null)) const SizedBox(height: 4),
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
