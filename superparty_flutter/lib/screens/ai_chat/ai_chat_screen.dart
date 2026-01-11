import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../providers/app_state_provider.dart';
import '../../services/ai_cache_service.dart';
import '../../services/chat_cache_service.dart';

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen> {
  // Theme colors (mobile-first dark theme)
  static const _bg = Color(0xFF0B1220);
  static const _bg2 = Color(0xFF111C35);
  static const _text = Color(0xFFEAF1FF);
  static const _muted = Color(0xB3EAF1FF);
  static const _border = Color(0x1FFFFFFF);
  static const _card = Color(0x14FFFFFF);
  static const _primary = Color(0xFF6366F1);
  static const _accent = Color(0xFF4ECDC4);
  static const _danger = Color(0xFFFF7878);

  // Storage keys
  static const _userNameKey = 'ai_user_name_v1';
  static const _galleryKey = 'ai_gallery_v1';
  static const _chatArchivesKey = 'ai_chat_archives_v1';

  final List<Map<String, String>> _messages = [];
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();

  bool _loading = false;
  String? _sessionId;
  String? _lastSentMessage;
  DateTime? _lastSentTime;
  String? _userName;
  bool _awaitingName = false;

  XFile? _pickedImage;
  Uint8List? _pickedBytes;

  final List<_GalleryItem> _gallery = [];
  _GalleryFilter _galleryFilter = _GalleryFilter.active;

  SharedPreferences? _prefs;

  @override
  void initState() {
    super.initState();
    _sessionId = 'session_${DateTime.now().millisecondsSinceEpoch}';
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    _prefs = await SharedPreferences.getInstance();
    _userName = _sanitizeName(_prefs?.getString(_userNameKey));
    _awaitingName = _userName == null;

    _loadGallery();
    await _loadCachedMessages();
    await _prefetchCommonResponses();

    if (_messages.isEmpty) {
      setState(() {
        _messages.add({'role': 'assistant', 'content': _welcomeText()});
      });
    }

    _scrollToBottomSoon();
  }

  String _sanitizeName(String? name) {
    final n = (name ?? '').trim().replaceAll(RegExp(r'\s+'), ' ');
    if (n.isEmpty) return '';
    return n.length > 32 ? n.substring(0, 32) : n;
  }

  String _welcomeText() => _userName != null
      ? 'Salut, $_userName! Cu ce te pot ajuta?\n\n💡 Poți crea evenimente direct din chat:\n• "Notează o petrecere pe 15 martie"\n• "Am de notat un eveniment pe 10 aprilie"\n• "Creează o petrecere la Grand Hotel"\n• Sau folosește: /event [descriere]'
      : 'Salut! Cum te cheamă?';

  Future<void> _scrollToBottomSoon() async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    if (!mounted) return;
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  /// Prefetch common responses in background
  Future<void> _prefetchCommonResponses() async {
    await AICacheService.prefetchCommonResponses();
  }

  Future<void> _loadCachedMessages() async {
    ChatCacheService.getRecentMessages(limit: 20).then((cached) {
      if (cached.isNotEmpty && mounted) {
        setState(() {
          _messages.clear();
          for (final msg in cached.reversed) {
            _messages.add({'role': 'user', 'content': msg['userMessage']});
            _messages.add({'role': 'assistant', 'content': msg['aiResponse']});
          }
          if (_userName == null) {
            _awaitingName = true;
            _messages.add({
              'role': 'assistant',
              'content': 'Înainte să continuăm, cum te cheamă?'
            });
          }
        });
      }
    }).catchError((e) {
      // ignore
      // debugPrint('Error loading cache: $e');
    });
  }

  void _loadGallery() {
    try {
      final raw = _prefs?.getString(_galleryKey);
      if (raw == null || raw.isEmpty) return;
      final list = jsonDecode(raw);
      if (list is! List) return;

      _gallery.clear();
      for (final item in list) {
        if (item is Map<String, dynamic>) {
          _gallery.add(_GalleryItem.fromJson(item));
        } else if (item is Map) {
          _gallery.add(_GalleryItem.fromJson(
              item.map((k, v) => MapEntry(k.toString(), v))));
        }
      }
    } catch (_) {
      // ignore
    }
  }

  void _saveGallery() {
    try {
      final capped = _gallery.length > 80
          ? _gallery.sublist(_gallery.length - 80)
          : _gallery;
      _prefs?.setString(
          _galleryKey, jsonEncode(capped.map((e) => e.toJson()).toList()));
    } catch (_) {
      // ignore
    }
  }

  void _appendChatArchive(String kind, Map<String, dynamic> payload) {
    try {
      final raw = _prefs?.getString(_chatArchivesKey);
      final arr = raw != null && raw.isNotEmpty ? jsonDecode(raw) : [];
      final list = (arr is List) ? arr : <dynamic>[];
      list.add({
        'ts': DateTime.now().millisecondsSinceEpoch,
        'kind': kind,
        'payload': payload,
      });
      final capped = list.length > 200 ? list.sublist(list.length - 200) : list;
      _prefs?.setString(_chatArchivesKey, jsonEncode(capped));
    } catch (_) {
      // ignore
    }
  }

  Future<void> _pickImage() async {
    try {
      final picker = ImagePicker();
      final x = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 82,
      );
      if (x == null) return;
      final bytes = await x.readAsBytes();
      setState(() {
        _pickedImage = x;
        _pickedBytes = bytes;
      });
    } catch (e) {
      if (!mounted) return;
      _showSnack('Nu pot procesa imaginea: $e');
    }
  }

  String _describeUserMessage(String text, bool hasImage, String? imageName) {
    final t = text.trim();
    if (t.isNotEmpty && hasImage)
      return '$t\n[Imagine atașată: ${imageName ?? "poză"}]';
    if (hasImage) return '[Imagine atașată: ${imageName ?? "poză"}]';
    return t;
  }

  Future<void> _sendMessage() async {
    final text = _inputController.text.trim();
    final hasImage = _pickedImage != null && _pickedBytes != null;

    if ((text.isEmpty && !hasImage) || _loading) return;

    // DEDUPLICATION: Prevent sending same message twice in 2 seconds
    if (_lastSentMessage == text && _lastSentTime != null && !hasImage) {
      final timeSinceLastSent = DateTime.now().difference(_lastSentTime!);
      if (timeSinceLastSent.inSeconds < 2) return;
    }

    _lastSentMessage = text;
    _lastSentTime = DateTime.now();

    final imageName = _pickedImage?.name;

    // UI: add user message
    setState(() {
      _messages.add({
        'role': 'user',
        'content': _describeUserMessage(text, hasImage, imageName)
      });
    });

    // Save image to gallery at send time
    if (hasImage) {
      _gallery.add(_GalleryItem(
        id: _makeImageId(),
        ts: DateTime.now().millisecondsSinceEpoch,
        name: imageName ?? 'imagine.jpg',
        mime: 'image/jpeg',
        base64: base64Encode(_pickedBytes!),
        status: _GalleryStatus.active,
      ));
      _saveGallery();
    }

    _inputController.clear();
    _focusNode.unfocus();
    setState(() {
      _pickedImage = null;
      _pickedBytes = null;
    });
    _scrollToBottomSoon();

    // Capture name
    if (_awaitingName) {
      final name = _sanitizeName(text);
      if (name.isNotEmpty) {
        _userName = name;
        _prefs?.setString(_userNameKey, name);
        _awaitingName = false;
        setState(() {
          _messages.add({
            'role': 'assistant',
            'content': 'Încântat, $_userName! Cu ce te pot ajuta?'
          });
        });
      } else {
        _awaitingName = true;
        setState(() {
          _messages.add({
            'role': 'assistant',
            'content': 'Nu am prins numele. Îmi spui cum te cheamă?'
          });
        });
      }
      _scrollToBottomSoon();
      return;
    }

    final user = FirebaseAuth.instance.currentUser;

    // AUTH CHECK
    if (user == null) {
      setState(() {
        _messages.add({
          'role': 'assistant',
          'content':
              '⚠️ Trebuie să fii logat pentru a folosi AI Chat.\n\nTe rog loghează-te mai întâi și apoi revino aici. 🔐'
        });
      });
      _scrollToBottomSoon();
      return;
    }

    final isAdmin = user.email == 'ursache.andrei1995@gmail.com';
    final appState = Provider.of<AppStateProvider>(context, listen: false);

    // Secret commands for admin
    if (isAdmin && text.toLowerCase() == 'admin') {
      appState.setAdminMode(true);
      Navigator.pop(context);
      appState.openGrid();
      return;
    }
    if (isAdmin && text.toLowerCase() == 'gm') {
      appState.setGmMode(true);
      Navigator.pop(context);
      appState.openGrid();
      return;
    }

    // Check cache first (only for text without image)
    // Detect event intent early (before cache) to avoid cache hijacking event commands
    final lowerText = text.toLowerCase();
    final isExplicitCommand =
        lowerText.startsWith('/event ') || lowerText.startsWith('/eveniment ');
    final hasNaturalEventIntent = _detectEventIntent(text);
    final isEventCommand = isExplicitCommand || hasNaturalEventIntent;

    // Check cache first (only for non-event text without image)
    final cachedResponse = (!hasImage && !isEventCommand)
        ? await AICacheService.getCachedResponse(text)
        : null;
    if (cachedResponse != null) {
      setState(() {
        _messages.add({'role': 'assistant', 'content': cachedResponse});
      });
      _scrollToBottomSoon();

      ChatCacheService.saveMessage(
        sessionId: _sessionId!,
        userMessage: text,
        aiResponse: cachedResponse,
        important: false,
      ).catchError((_) {});
      return;
    }

    // Placeholder
    final placeholderIndex = _messages.length;
    setState(() {
      _messages.add({'role': 'assistant', 'content': '...'});
      _loading = true;
    });
    _scrollToBottomSoon();

    try {
      String aiResponse;

      if (isEventCommand) {
        // Extract command text
        String commandText;
        if (isExplicitCommand) {
          // Remove /event or /eveniment prefix
          final prefixLength = lowerText.startsWith('/event ') ? 7 : 11;
          commandText = text.substring(prefixLength).trim();
        } else {
          // Use full text for natural language
          commandText = text;
        }
        
        // Generate unique clientRequestId for idempotency
        final clientRequestId = 'req_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(9999)}';
        
        // Call chatEventOps with dryRun=true for preview
        final eventCallable =
            FirebaseFunctions.instanceFor(region: 'us-central1').httpsCallable(
          'chatEventOps',
          options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
        );

        final previewResult = await eventCallable.call({
          'text': commandText,
          'dryRun': true,
          'clientRequestId': clientRequestId,
        });
        
        final previewData = Map<String, dynamic>.from(previewResult.data);
        
        // Remove placeholder and show preview
        setState(() {
          _messages.removeAt(placeholderIndex);
          _loading = false;
        });
        
        // Show preview card with confirmation buttons
        _showEventPreview(
          context: context,
          previewData: previewData,
          commandText: commandText,
          clientRequestId: clientRequestId,
        );
        
        return; // Don't add response message yet, wait for confirmation
      } else {
        // Use regular chatWithAI for normal conversation
        final callable =
            FirebaseFunctions.instanceFor(region: 'us-central1').httpsCallable(
          'chatWithAI',
          options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
        );

        final messagesToSend = _messages
            .where((m) => m['content'] != '...')
            .toList()
            .reversed
            .take(10)
            .toList()
            .reversed
            .toList();

        if (_userName != null && _userName!.isNotEmpty) {
          messagesToSend.insert(0, {
            'role': 'system',
            'content': 'Numele utilizatorului este: $_userName'
          });
        }

        final result = await callable.call({
          'messages': messagesToSend,
          'sessionId': _sessionId,
        });

        aiResponse = result.data['message'] ?? 'No response';
      }

      if (!hasImage) {
        AICacheService.cacheResponse(text, aiResponse).catchError((_) {});
      }

      setState(() {
        _messages[placeholderIndex] = {
          'role': 'assistant',
          'content': aiResponse
        };
      });

      _scrollToBottomSoon();

      final isImportant = text.length > 20 &&
          !['ok', 'da', 'nu', 'haha', 'lol'].contains(text.toLowerCase());

      ChatCacheService.saveMessage(
        sessionId: _sessionId!,
        userMessage: text,
        aiResponse: aiResponse,
        important: isImportant,
      ).catchError((_) {});
    } catch (e) {
      String errorMessage = 'Eroare necunoscută';

      if (e is FirebaseFunctionsException) {
        errorMessage = _mapFirebaseError(e);
      } else if (e.toString().contains('timeout')) {
        errorMessage = 'Timeout - încearcă din nou';
      } else {
        errorMessage = 'Conexiune eșuată: ${e.toString()}';
      }

      setState(() {
        _messages[placeholderIndex] = {
          'role': 'assistant',
          'content': 'Eroare: $errorMessage'
        };
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _mapFirebaseError(FirebaseFunctionsException e) {
    switch (e.code) {
      case 'unauthenticated':
        return 'Trebuie să fii logat ca să folosești AI. Te rog loghează-te mai întâi.';
      case 'failed-precondition':
        return 'AI nu este configurat pe server (cheie API lipsă). Contactează administratorul.';
      case 'invalid-argument':
        return 'Cerere invalidă. Încearcă din nou sau contactează suportul.';
      case 'deadline-exceeded':
        return 'Timeout. Serverul nu a răspuns la timp. Încearcă din nou.';
      case 'resource-exhausted':
        return 'Prea multe cereri. Te rog așteaptă câteva secunde și încearcă din nou.';
      case 'internal':
        return 'Eroare internă pe server. Încearcă din nou mai târziu.';
      case 'unavailable':
        return 'Serviciul AI este temporar indisponibil. Încearcă din nou.';
      default:
        return 'Eroare: ${e.message ?? e.code}';
    }
  }

  // ===================== UI =====================

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: _bg,
        colorScheme: const ColorScheme.dark().copyWith(
          primary: _primary,
          secondary: _accent,
          error: _danger,
        ),
      ),
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [_bg2, _bg],
            ),
          ),
          child: SafeArea(
            bottom: true,
            child: Column(
              children: [
                _buildAppBar(context),
                Expanded(child: _buildChatShell(context)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: _bg.withOpacity(0.72),
        border: const Border(bottom: BorderSide(color: Color(0x14FFFFFF))),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: _text),
            onPressed: () => Navigator.of(context).pop(),
          ),
          const Expanded(
            child: Text(
              'Chat AI',
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w900, color: _text),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Wrap(
            spacing: 10,
            children: [
              _pillButton('Galerie', onTap: _openGallerySheet),
              _pillButton('Arhivează', onTap: _confirmArchiveConversation),
              _pillButton('Șterge', onTap: _confirmDeleteConversation),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pillButton(String label, {required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.14)),
        ),
        child: Text(
          label,
          style: const TextStyle(
              fontSize: 12, fontWeight: FontWeight.w900, color: _text),
        ),
      ),
    );
  }

  Widget _buildChatShell(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
        boxShadow: const [
          BoxShadow(
              color: Colors.black54, blurRadius: 40, offset: Offset(0, 18))
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Expanded(child: _buildMessages()),
          if (_loading) const LinearProgressIndicator(minHeight: 3),
          _buildComposer(),
        ],
      ),
    );
  }

  Widget _buildMessages() {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      itemCount: _messages.length,
      cacheExtent: 1000,
      itemBuilder: (context, index) {
        final msg = _messages[index];
        final isUser = msg['role'] == 'user';
        final isAssistant = msg['role'] == 'assistant';

        final bg = isUser
            ? _primary.withOpacity(0.22)
            : (isAssistant
                ? Colors.white.withOpacity(0.07)
                : _accent.withOpacity(0.12));
        final border = isUser
            ? _primary.withOpacity(0.32)
            : (isAssistant
                ? Colors.white.withOpacity(0.12)
                : _accent.withOpacity(0.22));

        final align = isUser ? Alignment.centerRight : Alignment.centerLeft;

        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Align(
            alignment: align,
            child: Container(
              constraints: const BoxConstraints(maxWidth: 560),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(14),

                border: Border.all(color: border),
              ),
              child: (msg['content'] == '...')
                  ? const _TypingIndicator()
                  : Text(
                      msg['content'] ?? '',
                      style: const TextStyle(
                          fontSize: 14, height: 1.35, color: _text),
                    ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildComposer() {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: _bg.withOpacity(0.55),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.10))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          IconButton(
            tooltip: 'Încarcă poză',
            onPressed: _pickImage,
            icon: const Text('📷', style: TextStyle(fontSize: 18)),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.22),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withOpacity(0.14)),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              child: TextField(
                controller: _inputController,
                focusNode: _focusNode,
                minLines: 1,
                maxLines: 4,
                style: const TextStyle(color: _text, fontSize: 14, height: 1.3),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  hintText: 'Scrie un mesaj sau "Notează o petrecere..."',
                  hintStyle: TextStyle(color: Color(0x8CEAF1FF)),
                ),
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
          ),
          const SizedBox(width: 10),
          ElevatedButton(
            onPressed: _loading ? null : _sendMessage,
            style: ElevatedButton.styleFrom(
              backgroundColor: _primary.withOpacity(0.20),
              foregroundColor: _text,
              side: BorderSide(color: _primary.withOpacity(0.35)),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              textStyle: const TextStyle(fontWeight: FontWeight.w900),
            ),
            child: const Text('Trimite'),
          ),
        ],
      ),
    );
  }

  // ===================== Gallery Sheet =====================

  void _openGallerySheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black.withOpacity(0.55),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Container(
            constraints: BoxConstraints(
              maxHeight: min(720, MediaQuery.of(ctx).size.height - 24),
            ),
            decoration: BoxDecoration(
              color: _bg.withOpacity(0.92),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withOpacity(0.12)),
              boxShadow: const [
                BoxShadow(
                    color: Colors.black54,
                    blurRadius: 50,
                    offset: Offset(0, 24))
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                _buildGalleryHeader(ctx),
                Expanded(child: _buildGalleryBody()),
                _buildGalleryFooter(),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildGalleryHeader(BuildContext ctx) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        border:
            Border(bottom: BorderSide(color: Colors.white.withOpacity(0.10))),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Galerie imagini',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                        color: _text)),
                SizedBox(height: 2),
                Text(
                  '„Șterge" și „Arhivează" sunt doar vizuale. În producție: soft-delete/soft-archive în Firebase.',
                  style: TextStyle(fontSize: 11, color: _muted),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(ctx).pop(),
            icon:
                const Text('✕', style: TextStyle(fontWeight: FontWeight.w900)),
          )
        ],
      ),
    );
  }

  Widget _buildGalleryBody() {
    final filtered = _gallery.where((x) {
      if (_galleryFilter == _GalleryFilter.all) return true;
      if (_galleryFilter == _GalleryFilter.active)
        return x.status == _GalleryStatus.active;
      if (_galleryFilter == _GalleryFilter.archived)
        return x.status == _GalleryStatus.archived;
      return x.status == _GalleryStatus.deleted;
    }).toList()
      ..sort((a, b) => (b.ts).compareTo(a.ts));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Row(
            children: [
              const Text('Afișează  ',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      color: _muted)),
              DropdownButton<_GalleryFilter>(
                value: _galleryFilter,
                dropdownColor: _bg,
                items: const [
                  DropdownMenuItem(
                      value: _GalleryFilter.active, child: Text('Active')),
                  DropdownMenuItem(
                      value: _GalleryFilter.archived, child: Text('Arhivate')),
                  DropdownMenuItem(
                      value: _GalleryFilter.deleted, child: Text('Șterse')),
                  DropdownMenuItem(
                      value: _GalleryFilter.all, child: Text('Toate')),
                ],
                onChanged: (v) =>
                    setState(() => _galleryFilter = v ?? _GalleryFilter.active),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (filtered.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _border),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Nicio poză',
                      style: TextStyle(fontWeight: FontWeight.w900)),
                  SizedBox(height: 4),
                  Text('Încarcă o imagine și apasă „Trimite".',
                      style: TextStyle(color: _muted)),
                ],
              ),
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                final w = constraints.maxWidth;
                final cols = w < 420 ? 1 : 2;
                final spacing = 10.0;
                final itemW = (w - (cols - 1) * spacing) / cols;

                return Wrap(
                  spacing: spacing,
                  runSpacing: spacing,
                  children: [
                    for (final it in filtered)
                      SizedBox(
                        width: itemW,
                        child: _buildGalleryCard(it),
                      ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildGalleryCard(_GalleryItem it) {
    final bytes = it.base64.isNotEmpty ? base64Decode(it.base64) : Uint8List(0);
    final tag = switch (it.status) {
      _GalleryStatus.active => 'Activ',
      _GalleryStatus.archived => 'Arhivat',
      _GalleryStatus.deleted => 'Șters',
    };

    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: bytes.isEmpty
                ? Container(color: Colors.black.withOpacity(0.18))
                : Image.memory(bytes, fit: BoxFit.cover),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(it.name,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w900),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: it.status == _GalleryStatus.archived
                          ? _accent.withOpacity(0.30)
                          : (it.status == _GalleryStatus.deleted
                              ? _danger.withOpacity(0.30)
                              : _border),
                    ),
                    color: it.status == _GalleryStatus.archived
                        ? _accent.withOpacity(0.12)
                        : (it.status == _GalleryStatus.deleted
                            ? _danger.withOpacity(0.10)
                            : Colors.white.withOpacity(0.06)),
                  ),
                  child: Text(tag,
                      style: const TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w900)),
                ),
                const SizedBox(height: 6),
                Text(_formatTs(it.ts),
                    style: const TextStyle(color: _muted, fontSize: 12)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () =>
                            _setGalleryStatus(it.id, _GalleryStatus.archived),
                        style: OutlinedButton.styleFrom(
                          side:
                              BorderSide(color: Colors.white.withOpacity(0.14)),
                          foregroundColor: _text,
                          backgroundColor: Colors.white.withOpacity(0.06),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('Arhivează',
                            style: TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 12)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () async {
                          final ok = await _confirm(
                              'Ștergi poza din vizual? (în producție rămâne în Firebase)');
                          if (!ok) return;
                          _setGalleryStatus(it.id, _GalleryStatus.deleted);
                        },
                        style: OutlinedButton.styleFrom(
                          side:
                              BorderSide(color: Colors.white.withOpacity(0.14)),
                          foregroundColor: _text,
                          backgroundColor: Colors.white.withOpacity(0.06),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('Șterge',
                            style: TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 12)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGalleryFooter() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.10))),
      ),
      child: Row(
        children: [
          ElevatedButton(
            onPressed: () => setState(() {}),
            style: ElevatedButton.styleFrom(
              backgroundColor: _primary.withOpacity(0.20),
              foregroundColor: _text,
              side: BorderSide(color: _primary.withOpacity(0.35)),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontWeight: FontWeight.w900),
            ),
            child: const Text('Refresh'),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Recomandare: salvați poza în Storage și păstrați în Firestore doar URL + metadata.',
              style: TextStyle(color: _muted, fontSize: 11),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  void _setGalleryStatus(String id, _GalleryStatus status) {
    final idx = _gallery.indexWhere((x) => x.id == id);
    if (idx < 0) return;
    setState(() {
      _gallery[idx] = _gallery[idx].copyWith(status: status);
    });
    _saveGallery();
  }

  String _formatTs(int ts) {
    final d = DateTime.fromMillisecondsSinceEpoch(ts);
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${pad(d.day)}.${pad(d.month)}.${d.year} ${pad(d.hour)}:${pad(d.minute)}';
  }

  // ===================== Archive/Delete conversation =====================

  Future<void> _confirmArchiveConversation() async {
    final ok = await _confirm(
        'Arhivezi conversația? (în producție: soft-archive în Firestore)');
    if (!ok) return;

    _appendChatArchive('archived', {'sessionId': _sessionId});

    setState(() {
      _messages.clear();
      _messages.add({
        'role': 'assistant',
        'content':
            'Conversația a fost arhivată (demo local). În producție: setare flag în Firestore, fără ștergere fizică.',
      });
    });
    _scrollToBottomSoon();
  }

  Future<void> _confirmDeleteConversation() async {
    final ok = await _confirm(
        'Ștergi conversația din vizual? (în producție: soft-delete în Firestore)');
    if (!ok) return;

    _appendChatArchive('deleted', {'sessionId': _sessionId});

    setState(() {
      _messages.clear();
      _messages.add({
        'role': 'assistant',
        'content':
            'Conversația a fost ștearsă vizual (demo local). În producție: soft-delete în Firestore, fără ștergere fizică.',
      });
    });
    _scrollToBottomSoon();
  }

  Future<bool> _confirm(String text) async {
    final res = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _bg,
        title: const Text('Confirmare',
            style: TextStyle(color: _text, fontWeight: FontWeight.w900)),
        content: Text(text, style: const TextStyle(color: _muted)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Anulează')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('OK')),
        ],
      ),
    );
    return res ?? false;
  }

  void _showSnack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text)),
    );
  }

  String _makeImageId() {
    final r = Random().nextInt(1 << 32).toRadixString(16);
    return 'img_${DateTime.now().millisecondsSinceEpoch}_$r';
  }

  // ===================== Event Command Preview =====================

  void _showEventPreview({
    required BuildContext context,
    required Map<String, dynamic> previewData,
    required String commandText,
    required String clientRequestId,
  }) {
    final action = previewData['action']?.toString().toUpperCase() ?? 'NONE';
    final ok = previewData['ok'] == true;
    final message = previewData['message']?.toString() ?? '';

    // ASK_INFO: AI needs more information (conversational mode)
    if (action == 'ASK_INFO') {
      setState(() {
        _messages.add({
          'role': 'assistant',
          'content': message.isNotEmpty ? message : 'Am nevoie de mai multe informații pentru a continua.',
        });
      });
      _scrollToBottomSoon();
      return;
    }

    if (!ok || action == 'NONE') {
      // Show error message
      setState(() {
        _messages.add({
          'role': 'assistant',
          'content': '❌ $message',
        });
      });
      _scrollToBottomSoon();
      return;
    }

    // For LIST action, show results directly (no confirmation needed)
    if (action == 'LIST') {
      final items = previewData['items'] as List<dynamic>? ?? [];
      final listText = _formatEventList(items);
      setState(() {
        _messages.add({
          'role': 'assistant',
          'content': listText,
        });
      });
      _scrollToBottomSoon();
      return;
    }

    // Show preview card with confirmation buttons
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Preview: $action'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                message,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              if (previewData['data'] != null) ...[
                const Text(
                  'Date care vor fi scrise:',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.grey[100],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _formatPreviewData(previewData['data']),
                    style: const TextStyle(
                      fontSize: 12,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
              if (previewData['eventId'] != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Event ID: ${previewData['eventId']}',
                  style: const TextStyle(fontSize: 12, color: Colors.blue),
                ),
              ],
              if (previewData['reason'] != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Motiv: ${previewData['reason']}',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              setState(() {
                _messages.add({
                  'role': 'assistant',
                  'content': '❌ Operație anulată.',
                });
              });
              _scrollToBottomSoon();
            },
            child: const Text('Anulează'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              _executeEventCommand(
                commandText: commandText,
                clientRequestId: clientRequestId,
                action: action,
              );
            },
            child: const Text('Confirmă'),
          ),
        ],
      ),
    );
  }

  String _formatPreviewData(dynamic data) {
    try {
      if (data is Map) {
        return const JsonEncoder.withIndent('  ').convert(data);
      }
      return data.toString();
    } catch (e) {
      return data.toString();
    }
  }

  String _formatEventList(List<dynamic> items) {
    if (items.isEmpty) {
      return '📋 Nu există evenimente active.';
    }

    final buffer = StringBuffer('📋 Evenimente active (${items.length}):\n\n');
    for (var i = 0; i < items.length; i++) {
      final item = items[i] as Map<String, dynamic>;
      final id = item['id'] ?? 'N/A';
      final date = item['date'] ?? 'N/A';
      final nume = item['sarbatoritNume'] ?? 'N/A';
      final address = item['address'] ?? 'N/A';
      
      buffer.writeln('${i + 1}. $nume ($date)');
      buffer.writeln('   📍 $address');
      buffer.writeln('   🆔 $id');
      if (i < items.length - 1) buffer.writeln();
    }

    return buffer.toString();
  }

  Future<void> _executeEventCommand({
    required String commandText,
    required String clientRequestId,
    required String action,
  }) async {
    // Show loading
    setState(() {
      _messages.add({'role': 'assistant', 'content': '...'});
      _loading = true;
    });
    _scrollToBottomSoon();

    try {
      final eventCallable =
          FirebaseFunctions.instanceFor(region: 'us-central1').httpsCallable(
        'chatEventOps',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
      );

      final result = await eventCallable.call({
        'text': commandText,
        'dryRun': false,
        'clientRequestId': clientRequestId,
      });

      final data = Map<String, dynamic>.from(result.data);
      final ok = data['ok'] == true;
      final message = data['message']?.toString() ?? 'Operație completată';
      final eventId = data['eventId'];

      String response;
      if (ok) {
        response = '✅ $message';
        if (eventId != null) {
          response += '\n\n🆔 Event ID: $eventId';
          response += '\n\n💡 Poți deschide evenimentul din secțiunea Evenimente.';
        }
      } else {
        response = '❌ $message';
      }

      setState(() {
        _messages.removeLast(); // Remove loading
        _messages.add({'role': 'assistant', 'content': response});
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _messages.removeLast(); // Remove loading
        _messages.add({
          'role': 'assistant',
          'content': '❌ Eroare la executare: $e',
        });
        _loading = false;
      });
    }

    _scrollToBottomSoon();
  }

  /// Normalize text: lowercase + strip diacritics
  String _normalizeText(String text) {
    return text
        .toLowerCase()
        .replaceAll('ă', 'a')
        .replaceAll('â', 'a')
        .replaceAll('î', 'i')
        .replaceAll('ș', 's')
        .replaceAll('ț', 't')
        .trim();
  }

  /// Detect if user message has event creation/management intent
  /// Returns true if message contains keywords indicating event operations
  bool _detectEventIntent(String text) {
    final normalized = _normalizeText(text);
    
    // Skip very short messages (likely not event commands)
    if (normalized.length < 10) return false;
    
    // CREATE intent keywords (normalized - fără diacritice)
    final createPatterns = [
      // GENERIC - fără tip specific de eveniment
      'noteaza o petrecere',
      'noteaza un eveniment',
      'noteaza petrecere',
      'noteaza eveniment',
      
      // "am de notat"
      'am de notat',
      'trebuie sa notez',
      
      // "creeaza"
      'creeaza o petrecere',
      'creeaza un eveniment',
      'creeaza petrecere',
      'creeaza eveniment',
      
      // "vreau sa notez"
      'vreau sa notez o petrecere',
      'vreau sa notez un eveniment',
      'vreau sa notez',
      
      // "am o petrecere"
      'am o petrecere',
      'am un eveniment',
      'am petrecere',
      'am eveniment',
      
      // Alte variante
      'salveaza o petrecere',
      'salveaza un eveniment',
      'adauga o petrecere',
      'adauga un eveniment',
      
      // Cu tipuri specifice (opțional, pentru backward compatibility)
      'noteaza nunta',
      'noteaza botez',
      'am o nunta',
      'am un botez',
      'am o aniversare',
      
      // Event type + date pattern (strong signal)
      'nuntă pe',
      'nunta pe',
      'botez pe',
      'petrecere pe',
      'aniversare pe',
      'eveniment pe',
    ];
    
    // UPDATE intent keywords (normalized)
    final updatePatterns = [
      'actualizeaza eveniment',
      'modifica eveniment',
      'schimba adresa',
      'schimba data',
      'update eveniment',
    ];
    
    // ARCHIVE intent keywords (normalized)
    final archivePatterns = [
      'arhiveaza eveniment',
      'anuleaza eveniment',
      'sterge eveniment',
      'inchide eveniment',
    ];
    
    // LIST intent keywords (normalized)
    final listPatterns = [
      'arata evenimente',
      'lista evenimente',
      'ce evenimente am',
      'evenimente active',
      'vezi evenimente',
      'afiseaza evenimente',
      'show evenimente',
    ];
    
    // Check all patterns (using normalized text)
    for (final pattern in createPatterns) {
      if (normalized.contains(pattern)) return true;
    }
    
    for (final pattern in updatePatterns) {
      if (normalized.contains(pattern)) return true;
    }
    
    for (final pattern in archivePatterns) {
      if (normalized.contains(pattern)) return true;
    }
    
    for (final pattern in listPatterns) {
      if (normalized.contains(pattern)) return true;
    }
    
    return false;
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _inputController.dispose();
    _focusNode.dispose();
    super.dispose();
  }
}

// ===================== Models =====================

enum _GalleryStatus { active, archived, deleted }

enum _GalleryFilter { active, archived, deleted, all }

class _GalleryItem {
  const _GalleryItem({
    required this.id,
    required this.ts,
    required this.name,
    required this.mime,
    required this.base64,
    required this.status,
  });

  final String id;
  final int ts;
  final String name;
  final String mime;
  final String base64;
  final _GalleryStatus status;

  _GalleryItem copyWith({_GalleryStatus? status}) => _GalleryItem(
        id: id,
        ts: ts,
        name: name,
        mime: mime,
        base64: base64,
        status: status ?? this.status,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'ts': ts,
        'name': name,
        'mime': mime,
        'base64': base64,
        'status': status.name,
      };

  static _GalleryItem fromJson(Map<String, dynamic> j) {
    final st = (j['status'] ?? 'active').toString();
    final status = _GalleryStatus.values.firstWhere(
      (e) => e.name == st,
      orElse: () => _GalleryStatus.active,
    );

    return _GalleryItem(
      id: (j['id'] ?? '').toString(),
      ts: (j['ts'] is num)
          ? (j['ts'] as num).toInt()
          : int.tryParse('${j['ts']}') ?? 0,
      name: (j['name'] ?? 'imagine.jpg').toString(),
      mime: (j['mime'] ?? 'image/jpeg').toString(),
      base64: (j['base64'] ?? '').toString(),
      status: status,
    );
  }
}

// ===================== Typing Indicator =====================

class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1100))
      ..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = _c.value;
        double y(int i) {
          final phase = (t + i * 0.15) % 1.0;
          final v = sin(phase * 2 * pi);
          return -3 * max(0, v);
        }

        Widget dot(int i) => Transform.translate(
              offset: Offset(0, y(i)),
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                    color: const Color(0x8CEAF1FF),
                    borderRadius: BorderRadius.circular(99)),
              ),
            );

        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            dot(0),
            const SizedBox(width: 6),
            dot(1),
            const SizedBox(width: 6),
            dot(2),
            const SizedBox(width: 10),
            const Text('Scriu...',
                style: TextStyle(
                    color: Color(0xB3EAF1FF),
                    fontStyle: FontStyle.italic,
                    fontWeight: FontWeight.w700)),
          ],
        );
      },
    );
  }
}
