import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/whatsapp_api_service.dart';

class WhatsAppStatusScreen extends StatefulWidget {
  const WhatsAppStatusScreen({super.key});

  @override
  State<WhatsAppStatusScreen> createState() => _WhatsAppStatusScreenState();
}

class _WhatsAppStatusScreenState extends State<WhatsAppStatusScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  bool _isLoading = false;
  String? _errorMessage;
  String? _selectedAccountId;
  StreamSubscription<QuerySnapshot>? _statusSubscription;
  List<Map<String, dynamic>> _statusItems = [];

  @override
  void initState() {
    super.initState();
    _loadAccountAndListen();
  }

  @override
  void dispose() {
    _statusSubscription?.cancel();
    super.dispose();
  }

  int _extractEpoch(dynamic value) {
    if (value == null) return 0;
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is int) return value;
    if (value is double) return value.toInt();
    if (value is String) {
      final parsed = DateTime.tryParse(value);
      return parsed?.millisecondsSinceEpoch ?? 0;
    }
    return 0;
  }

  String? _extractPhoneFromJid(String? jid) {
    if (jid == null) return null;
    if (!(jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'))) return null;
    final parts = jid.split('@');
    if (parts.isEmpty) return null;
    final digits = parts[0].replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return null;
    return '+$digits';
  }

  Future<void> _loadAccountAndListen() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final response = await _apiService.getAccounts();
      if (response['success'] != true) {
        throw Exception('Failed to load accounts');
      }
      final accounts = (response['accounts'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();
      final connected = accounts.where((a) => a['status'] == 'connected').toList();
      if (connected.isEmpty) {
        setState(() {
          _errorMessage = 'No connected accounts';
          _isLoading = false;
        });
        return;
      }
      final sorted = [...connected];
      sorted.sort((a, b) {
        final aTs = _extractEpoch(a['updatedAt'] ?? a['lastUpdate'] ?? a['createdAt']);
        final bTs = _extractEpoch(b['updatedAt'] ?? b['lastUpdate'] ?? b['createdAt']);
        return bTs.compareTo(aTs);
      });
      _selectedAccountId = sorted.first['id'] as String?;
      _listenToStatuses();
    } catch (e) {
      setState(() {
        _errorMessage = 'Error loading status: $e';
        _isLoading = false;
      });
    }
  }

  void _listenToStatuses() {
    _statusSubscription?.cancel();
    final accountId = _selectedAccountId;
    if (accountId == null) return;
    final statusThreadId = '${accountId}__status@broadcast';
    final query = FirebaseFirestore.instance
        .collection('threads')
        .doc(statusThreadId)
        .collection('messages')
        .orderBy('tsSort', descending: true)
        .limit(200);
    _statusSubscription = query.snapshots().listen((snapshot) {
      final itemsBySender = <String, Map<String, dynamic>>{};
      for (final doc in snapshot.docs) {
        final data = doc.data();
        final senderJid = data['senderJid']?.toString();
        final senderName = data['senderName']?.toString();
        final senderKey = senderJid?.trim().isNotEmpty == true
            ? senderJid!.trim()
            : (senderName?.trim().isNotEmpty == true ? senderName!.trim() : 'unknown');
        final phone = _extractPhoneFromJid(senderJid);
        final displayName = senderName?.trim().isNotEmpty == true
            ? senderName!.trim()
            : (phone ?? 'Număr ascuns');
        final tsRaw = data['tsSort'];
        final tsValue = tsRaw is Timestamp
            ? tsRaw.toDate()
            : DateTime.fromMillisecondsSinceEpoch(_extractEpoch(tsRaw));
        final existing = itemsBySender[senderKey];
        if (existing == null || tsValue.isAfter(existing['lastAt'] as DateTime)) {
          itemsBySender[senderKey] = {
            'senderKey': senderKey,
            'senderJid': senderJid,
            'senderName': senderName,
            'displayName': displayName,
            'lastAt': tsValue,
            'lastMessage': data['body']?.toString() ?? '',
          };
        }
      }
      final items = itemsBySender.values.toList()
        ..sort((a, b) => (b['lastAt'] as DateTime).compareTo(a['lastAt'] as DateTime));
      setState(() {
        _statusItems = items;
        _isLoading = false;
      });
    }, onError: (error) {
      setState(() {
        _errorMessage = 'Error loading status: $error';
        _isLoading = false;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Status'),
        backgroundColor: const Color(0xFF25D366),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!))
              : _statusItems.isEmpty
                  ? const Center(child: Text('No status updates'))
                  : ListView.builder(
                      itemCount: _statusItems.length,
                      itemBuilder: (context, index) {
                        final item = _statusItems[index];
                        final displayName = item['displayName']?.toString() ?? 'Număr ascuns';
                        final lastAt = item['lastAt'] as DateTime?;
                        final lastMessage = item['lastMessage']?.toString() ?? '';
                        final senderJid = item['senderJid']?.toString() ?? '';
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFF25D366),
                            child: Text(
                              displayName.isNotEmpty ? displayName[0].toUpperCase() : '?',
                              style: const TextStyle(color: Colors.white),
                            ),
                          ),
                          title: Text(displayName, overflow: TextOverflow.ellipsis),
                          subtitle: lastMessage.isNotEmpty
                              ? Text(lastMessage, maxLines: 1, overflow: TextOverflow.ellipsis)
                              : null,
                          trailing: lastAt != null
                              ? Text(DateFormat('HH:mm').format(lastAt))
                              : null,
                          onTap: () {
                            final accountId = _selectedAccountId ?? '';
                            final senderName = item['senderName']?.toString() ?? '';
                            context.go(
                              '/whatsapp/status/view'
                              '?accountId=${Uri.encodeComponent(accountId)}'
                              '&senderJid=${Uri.encodeComponent(senderJid)}'
                              '&senderName=${Uri.encodeComponent(senderName)}',
                            );
                          },
                        );
                      },
                    ),
    );
  }
}
