import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../services/whatsapp_api_service.dart';

/// WhatsApp Inbox Screen - List threads per accountId
class WhatsAppInboxScreen extends StatefulWidget {
  const WhatsAppInboxScreen({super.key});

  @override
  State<WhatsAppInboxScreen> createState() => _WhatsAppInboxScreenState();
}

class _WhatsAppInboxScreenState extends State<WhatsAppInboxScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  
  List<Map<String, dynamic>> _accounts = [];
  String? _selectedAccountId;
  bool _isLoadingAccounts = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadAccounts();
  }

  Future<void> _loadAccounts() async {
    setState(() => _isLoadingAccounts = true);
    
    try {
      final response = await _apiService.getAccounts();
      if (response['success'] == true) {
        final accounts = (response['accounts'] as List<dynamic>? ?? [])
            .cast<Map<String, dynamic>>();
        
        if (mounted) {
          setState(() {
            _accounts = accounts;
            _isLoadingAccounts = false;
            // Auto-select first connected account if available
            if (_selectedAccountId == null && accounts.isNotEmpty) {
              final connected = accounts.firstWhere(
                (a) => a['status'] == 'connected',
                orElse: () => accounts.first,
              );
              _selectedAccountId = connected['id'] as String?;
            }
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoadingAccounts = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading accounts: $e')),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp Inbox'),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAccounts,
            tooltip: 'Refresh accounts',
          ),
        ],
      ),
      body: Column(
        children: [
          // Account selector
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[100],
              border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
            ),
            child: _isLoadingAccounts
                ? const Center(child: CircularProgressIndicator())
                : _accounts.isEmpty
                    ? const Text('No accounts found. Add an account first.')
                    : DropdownButtonFormField<String>(
                        value: _selectedAccountId,
                        decoration: const InputDecoration(
                          labelText: 'Select Account',
                          border: OutlineInputBorder(),
                          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        ),
                        items: _accounts.map((account) {
                          final id = account['id'] as String? ?? 'unknown';
                          final name = account['name'] as String? ?? 'Unnamed';
                          final status = account['status'] as String? ?? 'unknown';
                          return DropdownMenuItem<String>(
                            value: id,
                            child: Text('$name (${status.toUpperCase()})'),
                          );
                        }).toList(),
                        onChanged: (value) {
                          setState(() => _selectedAccountId = value);
                        },
                      ),
          ),
          
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search by phone or name...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) {
                setState(() => _searchQuery = value.toLowerCase());
              },
            ),
          ),

          // Threads list
          Expanded(
            child: _selectedAccountId == null
                ? const Center(
                    child: Text('Select an account to view threads'),
                  )
                : StreamBuilder<QuerySnapshot>(
                    stream: FirebaseFirestore.instance
                        .collection('threads')
                        .where('accountId', isEqualTo: _selectedAccountId)
                        .orderBy('lastMessageAt', descending: true)
                        .limit(100)
                        .snapshots(),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (snapshot.hasError) {
                        return Center(
                          child: Text('Error: ${snapshot.error}'),
                        );
                      }

                      if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                        return const Center(
                          child: Text('No threads found'),
                        );
                      }

                      // Filter by search query
                      final threads = snapshot.data!.docs.where((doc) {
                        if (_searchQuery.isEmpty) return true;
                        final data = doc.data() as Map<String, dynamic>;
                        final clientJid = (data['clientJid'] as String? ?? '').toLowerCase();
                        final displayName = (data['displayName'] as String? ?? '').toLowerCase();
                        final remoteJid = (data['remoteJid'] as String? ?? '').toLowerCase();
                        final phone = _extractPhoneFromJid(clientJid)?.toLowerCase() ?? '';
                        return clientJid.contains(_searchQuery) ||
                            displayName.contains(_searchQuery) ||
                            remoteJid.contains(_searchQuery) ||
                            phone.contains(_searchQuery);
                      }).toList();

                      if (threads.isEmpty) {
                        return const Center(
                          child: Text('No threads match search query'),
                        );
                      }

                      return ListView.builder(
                        itemCount: threads.length,
                        itemBuilder: (context, index) {
                          final doc = threads[index];
                          final data = doc.data() as Map<String, dynamic>;
                          
                          final threadId = doc.id;
                          final clientJid = data['clientJid'] as String? ?? '';
                          final displayName = data['displayName'] as String? ?? clientJid;
                          final lastMessageText = data['lastMessageText'] as String? ?? '';
                          final lastMessageAt = data['lastMessageAt'] as Timestamp?;

                          final phone = _extractPhoneFromJid(clientJid);

                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: const Color(0xFF25D366),
                              child: Text(
                                displayName.isNotEmpty ? displayName[0].toUpperCase() : '?',
                                style: const TextStyle(color: Colors.white),
                              ),
                            ),
                            title: Text(
                              displayName,
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (phone != null) Text(phone, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                                if (lastMessageText.isNotEmpty)
                                  Text(
                                    lastMessageText,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                              ],
                            ),
                            trailing: lastMessageAt != null
                                ? Text(
                                    DateFormat('HH:mm').format(lastMessageAt.toDate()),
                                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                                  )
                                : null,
                            onTap: () {
                              context.go('/whatsapp/chat?accountId=$_selectedAccountId&threadId=$threadId&clientJid=${Uri.encodeComponent(clientJid)}&phoneE164=${Uri.encodeComponent(phone ?? '')}');
                            },
                          );
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
