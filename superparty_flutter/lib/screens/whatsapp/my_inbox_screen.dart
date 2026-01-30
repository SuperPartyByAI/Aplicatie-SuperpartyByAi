import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/thread_model.dart';
import '../../services/whatsapp_api_service.dart';
import '../../services/whatsapp_account_service.dart';
import 'package:cached_network_image/cached_network_image.dart';

/// My Inbox Screen - Shows only threads from user's personal WhatsApp account
class MyInboxScreen extends StatefulWidget {
  const MyInboxScreen({super.key});

  @override
  State<MyInboxScreen> createState() => _MyInboxScreenState();
}

class _MyInboxScreenState extends State<MyInboxScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  final WhatsAppAccountService _accountService = WhatsAppAccountService.instance;

  String? _myAccountId;
  bool _isLoading = true;
  String? _errorMessage;
  String _searchQuery = '';
  List<ThreadModel> _threads = [];
  
  // Firestore thread stream
  StreamSubscription<QuerySnapshot>? _threadSubscription;
  List<Map<String, dynamic>> _threadsRaw = [];

  @override
  void initState() {
    super.initState();
    _loadMyAccount();
  }

  @override
  void dispose() {
    _threadSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadMyAccount() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final accountId = await _accountService.getMyWhatsAppAccountId();
      
      if (accountId == null || accountId.isEmpty) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Nu ai un cont WhatsApp personal configurat. Contactează administratorul.';
          _myAccountId = null;
        });
        return;
      }

      setState(() {
        _myAccountId = accountId;
      });

      _startThreadListener(accountId);
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Eroare la încărcarea contului: $e';
      });
    }
  }

  void _startThreadListener(String accountId) {
    _threadSubscription?.cancel();

    // Listen to Firestore threads for this account
    _threadSubscription = FirebaseFirestore.instance
        .collection('threads')
        .where('accountId', isEqualTo: accountId)
        .orderBy('lastMessageAt', descending: true)
        .limit(200)
        .snapshots()
        .listen(
      (snapshot) {
        _threadsRaw = snapshot.docs.map((doc) {
          return {
            'id': doc.id,
            ...doc.data(),
            'accountId': accountId,
          };
        }).toList();

        _rebuildThreads();
      },
      onError: (error) {
        debugPrint('[MyInboxScreen] Thread stream error: $error');
        if (mounted) {
          setState(() {
            _errorMessage = 'Eroare la încărcarea conversațiilor: $error';
          });
        }
      },
    );

    setState(() {
      _isLoading = false;
    });
  }

  void _rebuildThreads() {
    // Filter and deduplicate (simplified version from main inbox)
    final visibleThreads = _threadsRaw.where((thread) {
      final hidden = thread['hidden'] == true || thread['archived'] == true;
      final redirectTo = (thread['redirectTo'] as String? ?? '').trim();
      final clientJid = (thread['clientJid'] as String? ?? '').trim();
      final tid = (thread['id'] as String? ?? '').trim();
      final isBroadcast = clientJid.endsWith('@broadcast');
      if (hidden) return false;
      if (redirectTo.isNotEmpty) return false;
      if (isBroadcast) return false;
      if (tid.contains('[object Object]') || tid.contains('[obiect Obiect]')) return false;
      return true;
    }).toList();

    final models = visibleThreads
        .map((m) => ThreadModel.fromJson(Map<String, dynamic>.from(m)))
        .toList();

    // Sort by lastMessageAt descending
    models.sort((a, b) {
      final aTime = a.lastMessageAt;
      final bTime = b.lastMessageAt;
      if (aTime == null && bTime == null) return 0;
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime.compareTo(aTime);
    });

    if (mounted) {
      setState(() {
        _threads = models;
      });
    }
  }

  String? _extractPhoneFromJid(String? jid) {
    if (jid == null || jid.isEmpty) return null;
    if (jid.contains('@lid') || jid.contains('@broadcast')) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0].replaceAll(RegExp(r'\D'), '');
    if (digits.length < 6 || digits.length > 15) return null;
    return '+$digits';
  }

  Future<bool> _openWhatsAppForCall(String? phoneE164) async {
    if (phoneE164 == null || phoneE164.isEmpty) return false;
    
    var cleaned = phoneE164.trim().replaceAll(RegExp(r'[^\d+]'), '');
    final hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replaceAll('+', '');
    if (cleaned.isEmpty) return false;
    final e164 = hasPlus ? '+$cleaned' : cleaned;

    final native = Uri.parse('whatsapp://send?phone=$e164');
    if (await canLaunchUrl(native)) {
      return launchUrl(native, mode: LaunchMode.externalApplication);
    }

    final waDigits = e164.startsWith('+') ? e164.substring(1) : e164;
    final web = Uri.parse('https://wa.me/$waDigits');
    return launchUrl(web, mode: LaunchMode.externalApplication);
  }

  Future<void> _makePhoneCall(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    
    String cleaned = phone.trim();
    cleaned = cleaned.replaceAll(RegExp(r'[^\d+]'), '');
    final hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replaceAll('+', '');
    if (hasPlus && cleaned.isNotEmpty) {
      cleaned = '+$cleaned';
    }
    
    if (cleaned.isEmpty) return;
    
    final uri = Uri(scheme: 'tel', path: cleaned);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Eroare la apelare: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _threads.where((t) {
      if (_searchQuery.isEmpty) return true;
      final query = _searchQuery.toLowerCase();
      return t.displayName.toLowerCase().contains(query) ||
          (t.normalizedPhone ?? '').contains(query) ||
          t.lastMessageText.toLowerCase().contains(query);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('My WhatsApp Inbox'),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              if (_myAccountId != null) {
                _startThreadListener(_myAccountId!);
              } else {
                _loadMyAccount();
              }
            },
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.error_outline, size: 64, color: Colors.red[300]),
                        const SizedBox(height: 16),
                        Text(
                          _errorMessage!,
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.red[700]),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadMyAccount,
                          child: const Text('Reîncearcă'),
                        ),
                      ],
                    ),
                  ),
                )
              : Column(
                  children: [
                    // Search bar
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Caută conversații...',
                          prefixIcon: const Icon(Icons.search),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onChanged: (value) {
                          setState(() {
                            _searchQuery = value;
                          });
                        },
                      ),
                    ),
                    // Threads list
                    Expanded(
                      child: filtered.isEmpty
                          ? const Center(child: Text('Nu există conversații'))
                          : RefreshIndicator(
                              onRefresh: () async {
                                if (_myAccountId != null) {
                                  _startThreadListener(_myAccountId!);
                                }
                              },
                              child: ListView.builder(
                                itemCount: filtered.length,
                                itemBuilder: (context, index) {
                                  final t = filtered[index];
                                  final effectiveThreadId = (t.redirectTo ?? '').isNotEmpty
                                      ? t.redirectTo!
                                      : ((t.canonicalThreadId ?? '').isNotEmpty
                                          ? t.canonicalThreadId!
                                          : t.threadId);
                                  String timeText = '';
                                  if (t.lastMessageAt != null) {
                                    final now = DateTime.now();
                                    final diff = now.difference(t.lastMessageAt!);
                                    if (diff.inMinutes < 60) {
                                      timeText = '${diff.inMinutes}m ago';
                                    } else if (diff.inHours < 24) {
                                      timeText = '${diff.inHours}h ago';
                                    } else if (diff.inDays < 7) {
                                      timeText = DateFormat('EEE').format(t.lastMessageAt!);
                                    } else {
                                      timeText = DateFormat('dd/MM').format(t.lastMessageAt!);
                                    }
                                  }
                                  final ph = t.normalizedPhone ?? t.phone ?? '';
                                  final showPhone = ph.isNotEmpty &&
                                      (t.displayName.isEmpty ||
                                          t.displayName == ph ||
                                          RegExp(r'^\+?[\d\s\-\(\)]+$').hasMatch(t.displayName));
                                  final subtitleParts = <String>[];
                                  if (showPhone) subtitleParts.add(ph);
                                  if (t.lastMessageText.isNotEmpty) {
                                    if (subtitleParts.isNotEmpty) subtitleParts.add('•');
                                    subtitleParts.add(t.lastMessageText);
                                  }
                                  final subtitle = subtitleParts.isEmpty
                                      ? (ph.isNotEmpty ? ph : ' ')
                                      : subtitleParts.join(' ');

                                  return ListTile(
                                    leading: t.profilePictureUrl != null &&
                                            t.profilePictureUrl!.isNotEmpty
                                        ? CircleAvatar(
                                            backgroundImage: CachedNetworkImageProvider(
                                              t.profilePictureUrl!,
                                            ),
                                            onBackgroundImageError: (_, __) {},
                                          )
                                        : CircleAvatar(
                                            backgroundColor: const Color(0xFF25D366),
                                            child: Text(
                                              t.initial,
                                              style: const TextStyle(color: Colors.white),
                                            ),
                                          ),
                                    title: Text(
                                      t.displayName.isNotEmpty
                                          ? t.displayName
                                          : (t.normalizedPhone ?? t.phone ?? ''),
                                      style: const TextStyle(fontWeight: FontWeight.bold),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    subtitle: Text(
                                      subtitle,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 13),
                                    ),
                                    trailing: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (timeText.isNotEmpty)
                                          Text(
                                            timeText,
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey[600],
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                    onTap: () {
                                      context.go(
                                        '/whatsapp/chat?accountId=${Uri.encodeComponent(_myAccountId ?? '')}'
                                        '&threadId=${Uri.encodeComponent(effectiveThreadId)}'
                                        '&clientJid=${Uri.encodeComponent(t.clientJid)}'
                                        '&phoneE164=${Uri.encodeComponent(ph)}'
                                        '&displayName=${Uri.encodeComponent(t.displayName)}'
                                        '&returnRoute=${Uri.encodeComponent('/whatsapp/my-inbox')}',
                                      );
                                    },
                                  );
                                },
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }
}
