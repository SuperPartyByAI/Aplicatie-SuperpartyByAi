import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:provider/provider.dart';
import '../../services/chat_cache_service.dart';
import '../../services/ai_cache_service.dart';
import '../../providers/app_state_provider.dart';

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen> {
  final List<Map<String, String>> _messages = [];
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  bool _loading = false;
  String? _sessionId;
  String? _lastSentMessage;
  DateTime? _lastSentTime;

  @override
  void initState() {
    super.initState();
    _sessionId = 'session_${DateTime.now().millisecondsSinceEpoch}';
    _loadCachedMessages();
    _prefetchCommonResponses();
  }
  
  /// Prefetch common responses in background
  Future<void> _prefetchCommonResponses() async {
    // Warm up cache with common questions
    await AICacheService.prefetchCommonResponses();
  }

  Future<void> _loadCachedMessages() async {
    // OPTIMIZATION: Show welcome message immediately
    setState(() {
      _messages.add({'role': 'assistant', 'content': 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?'});
    });
    
    // Load cached messages in background (non-blocking)
    ChatCacheService.getRecentMessages(limit: 20).then((cached) {
      if (cached.isNotEmpty && mounted) {
        setState(() {
          _messages.clear();
          for (var msg in cached.reversed) {
            _messages.add({'role': 'user', 'content': msg['userMessage']});
            _messages.add({'role': 'assistant', 'content': msg['aiResponse']});
          }
          // Add welcome message at the end
          _messages.add({'role': 'assistant', 'content': 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?'});
        });
      }
    }).catchError((e) {
      print('Error loading cache: $e');
    });
  }

  Future<void> _sendMessage() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _loading) return;

    // DEDUPLICATION: Prevent sending same message twice in 2 seconds
    if (_lastSentMessage == text && _lastSentTime != null) {
      final timeSinceLastSent = DateTime.now().difference(_lastSentTime!);
      if (timeSinceLastSent.inSeconds < 2) {
        print('[AIChatScreen] Duplicate message blocked');
        return;
      }
    }
    
    _lastSentMessage = text;
    _lastSentTime = DateTime.now();

    final user = FirebaseAuth.instance.currentUser;
    
    // DIAGNOSTIC: Log user auth state
    print('[AIChatScreen] User auth state: uid=${user?.uid}, email=${user?.email}');
    
    // AUTH CHECK: Block if user is not authenticated
    if (user == null) {
      print('[AIChatScreen] User not authenticated - blocking AI call');
      setState(() {
        _messages.add({
          'role': 'assistant',
          'content': '⚠️ Trebuie să fii logat pentru a folosi AI Chat.\n\nTe rog loghează-te mai întâi și apoi revino aici. 🔐'
        });
      });
      return;
    }
    
    final isAdmin = user.email == 'ursache.andrei1995@gmail.com';
    final appState = Provider.of<AppStateProvider>(context, listen: false);

    // Secret commands for admin
    if (isAdmin && text.toLowerCase() == 'admin') {
      _inputController.clear();
      appState.setAdminMode(true);
      Navigator.pop(context); // Close AI Chat
      appState.openGrid(); // Open Grid with admin buttons
      return;
    }

    if (isAdmin && text.toLowerCase() == 'gm') {
      _inputController.clear();
      appState.setGmMode(true);
      Navigator.pop(context); // Close AI Chat
      appState.openGrid(); // Open Grid with GM buttons
      return;
    }

    // OPTIMISTIC UI: Add user message immediately
    setState(() {
      _messages.add({'role': 'user', 'content': text});
      _loading = true;
    });
    _inputController.clear();

    // EXTREME OPTIMIZATION: Check aggressive cache first
    final cachedResponse = await AICacheService.getCachedResponse(text);
    
    if (cachedResponse != null) {
      // Instant response from cache!
      setState(() {
        _messages.add({'role': 'assistant', 'content': cachedResponse});
        _loading = false;
      });
      
      // Auto-scroll
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
      
      return;
    }
    
    // OPTIMISTIC UI: Add placeholder for AI response
    final placeholderIndex = _messages.length;
    setState(() {
      _messages.add({'role': 'assistant', 'content': '...'});
    });

    try {
      // DIAGNOSTIC: Log function call details
      print('[AIChatScreen] Calling chatWithAI function in region: us-central1');
      
      // Call Firebase Function with timeout (explicitly specify region)
      final callable = FirebaseFunctions.instanceFor(region: 'us-central1').httpsCallable(
        'chatWithAI',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
      );
      
      // OPTIMIZATION: Send only last 5 messages to reduce payload
      final messagesToSend = _messages
          .where((m) => m['content'] != '...')
          .toList()
          .reversed
          .take(5)
          .toList()
          .reversed
          .toList();
      
      print('[AIChatScreen] Sending ${messagesToSend.length} messages to function');
      
      final result = await callable.call({
        'messages': messagesToSend,
        'sessionId': _sessionId,
      });
      
      print('[AIChatScreen] Function call successful');

      final aiResponse = result.data['message'] ?? 'No response';
      
      // Cache the response for future use
      AICacheService.cacheResponse(text, aiResponse).catchError((e) => print('Cache error: $e'));
      
      // Update placeholder with actual response
      setState(() {
        _messages[placeholderIndex] = {'role': 'assistant', 'content': aiResponse};
      });

      // Auto-scroll to bottom
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });

      // Save to cache asynchronously (don't wait)
      final isImportant = text.length > 20 && 
                         !['ok', 'da', 'nu', 'haha', 'lol'].contains(text.toLowerCase());
      
      ChatCacheService.saveMessage(
        sessionId: _sessionId!,
        userMessage: text,
        aiResponse: aiResponse,
        important: isImportant,
      ).catchError((e) => print('Cache save error: $e'));
      
    } catch (e) {
      // DIAGNOSTIC: Log full error details
      print('[AIChatScreen] Error caught: ${e.runtimeType}');
      print('[AIChatScreen] Error details: $e');
      
      String errorMessage = 'Eroare necunoscută';
      
      // Proper error mapping for FirebaseFunctionsException
      if (e is FirebaseFunctionsException) {
        print('[AIChatScreen] FirebaseFunctionsException code: ${e.code}');
        print('[AIChatScreen] FirebaseFunctionsException message: ${e.message}');
        print('[AIChatScreen] FirebaseFunctionsException details: ${e.details}');
        
        errorMessage = _mapFirebaseError(e);
      } else if (e.toString().contains('timeout')) {
        errorMessage = 'Timeout - încearcă din nou';
      } else {
        errorMessage = 'Conexiune eșuată: ${e.toString()}';
      }
      
      // Replace placeholder with error
      setState(() {
        _messages[placeholderIndex] = {
          'role': 'assistant', 
          'content': 'Eroare: $errorMessage'
        };
      });
    } finally {
      setState(() => _loading = false);
    }
  }
  
  /// Map Firebase Functions errors to user-friendly messages
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

  @override
  void dispose() {
    _scrollController.dispose();
    _inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('🤖 Chat AI'),
        backgroundColor: const Color(0xFF6366F1),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              // Performance optimization
              cacheExtent: 1000,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                final isUser = msg['role'] == 'user';
                final isTyping = msg['content'] == '...';
                
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.75,
                    ),
                    decoration: BoxDecoration(
                      color: isUser ? const Color(0xFF6366F1) : Colors.grey[300],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: isTyping
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(
                                width: 12,
                                height: 12,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    Colors.grey[600]!,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Scriu...',
                                style: TextStyle(
                                  color: Colors.grey[600],
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ],
                          )
                        : Text(
                            msg['content'] ?? '',
                            style: TextStyle(
                              color: isUser ? Colors.white : Colors.black,
                            ),
                          ),
                  ),
                );
              },
            ),
          ),
          if (_loading) const LinearProgressIndicator(),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    decoration: const InputDecoration(
                      hintText: 'Scrie un mesaj...',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send, color: Color(0xFF6366F1)),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
