import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/whatsapp_api_service.dart';

/// WhatsApp Diagnostics Screen (Debug Only)
/// 
/// Shows:
/// - Current user (uid, email)
/// - Token presence
/// - Connected accountId
/// - Last API response for accounts
/// - Firestore thread count
class WhatsAppDiagnosticsScreen extends StatefulWidget {
  const WhatsAppDiagnosticsScreen({super.key});

  @override
  State<WhatsAppDiagnosticsScreen> createState() => _WhatsAppDiagnosticsScreenState();
}

class _WhatsAppDiagnosticsScreenState extends State<WhatsAppDiagnosticsScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  Map<String, dynamic>? _lastAccountsResponse;
  String? _lastError;
  bool _isLoading = false;
  int? _threadCount;
  String? _selectedAccountId;
  String _clipboardTokenStatus = 'Not checked';

  Future<void> _copyAuthTokensToClipboard() async {
    if (!kDebugMode) return;
    final idToken = await FirebaseAuth.instance.currentUser?.getIdToken(true);
    String? appCheckToken;
    try {
      appCheckToken = await FirebaseAppCheck.instance.getToken(true);
    } catch (e) {
      appCheckToken = null;
      debugPrint('[WhatsAppDebug] appCheckToken error: ${e.runtimeType}');
    }
    final idTokenLen = idToken?.length ?? 0;
    final idTokenDotCount = idToken == null ? 0 : '.'.allMatches(idToken).length;
    final idTokenHash = idToken == null || idToken.isEmpty
        ? 'none'
        : sha256.convert(utf8.encode(idToken)).toString().substring(0, 8);
    final appCheckLen = appCheckToken?.length ?? 0;
    final appCheckHash = appCheckToken == null || appCheckToken.isEmpty
        ? 'none'
        : sha256.convert(utf8.encode(appCheckToken)).toString().substring(0, 8);

    debugPrint(
      '[WhatsAppDebug] idTokenLen=$idTokenLen, idTokenDotCount=$idTokenDotCount, idTokenHash=$idTokenHash',
    );
    debugPrint('[WhatsAppDebug] appCheckLen=$appCheckLen, appCheckHash=$appCheckHash');

    if (idToken == null || idToken.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('ID token unavailable'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    await Clipboard.setData(
      ClipboardData(text: 'ID=$idToken\nAPP=${appCheckToken ?? ''}\n'),
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          appCheckToken == null || appCheckToken.isEmpty
              ? 'Copied ID token (AppCheck unavailable)'
              : 'Copied tokens',
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Future<void> _validateClipboardTokens() async {
    if (!kDebugMode) return;
    final data = await Clipboard.getData('text/plain');
    final text = (data?.text ?? '').replaceAll('\r', '');
    if (text.trim().isEmpty) {
      setState(() {
        _clipboardTokenStatus = 'No clipboard tokens';
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Token looks valid: no')),
      );
      return;
    }

    String idToken = '';
    String appToken = '';
    for (final line in text.split('\n')) {
      if (line.startsWith('ID=')) {
        idToken = line.substring(3).trim();
      } else if (line.startsWith('APP=')) {
        appToken = line.substring(4).trim();
      }
    }

    final idLen = idToken.length;
    final idDotCount = idToken.isEmpty ? 0 : '.'.allMatches(idToken).length;
    final idHash = idToken.isEmpty
        ? 'none'
        : sha256.convert(utf8.encode(idToken)).toString().substring(0, 8);
    final appLen = appToken.length;
    final appHash = appToken.isEmpty
        ? 'none'
        : sha256.convert(utf8.encode(appToken)).toString().substring(0, 8);

    debugPrint(
      '[WhatsAppDebug] clipboard idLen=$idLen, idDotCount=$idDotCount, idHash=$idHash',
    );
    debugPrint('[WhatsAppDebug] clipboard appLen=$appLen, appHash=$appHash');

    final looksValidId = idDotCount == 2 && idLen > 500;
    final looksValidApp = appLen > 100;
    final looksValid = looksValidId && (looksValidApp || appLen == 0);
    setState(() {
      if (looksValidId && looksValidApp) {
        _clipboardTokenStatus = 'Valid';
      } else if (looksValidId && appLen == 0) {
        _clipboardTokenStatus = 'Valid (AppCheck missing)';
      } else {
        _clipboardTokenStatus = 'Invalid';
      }
    });
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Token looks valid: ${looksValid ? 'yes' : 'no'}')),
    );
  }

  @override
  void initState() {
    super.initState();
    if (kDebugMode) {
      _loadDiagnostics();
    }
  }

  Future<void> _loadDiagnostics() async {
    setState(() {
      _isLoading = true;
      _lastError = null;
    });

    try {
      // Test getAccounts API
      final response = await _apiService.getAccounts();
      setState(() {
        _lastAccountsResponse = response;
        final accounts = (response['accounts'] as List<dynamic>? ?? []);
        if (accounts.isNotEmpty) {
          _selectedAccountId = accounts.first['id'] as String?;
        }
      });

      // Count threads if account selected
      if (_selectedAccountId != null) {
        final threadsSnapshot = await FirebaseFirestore.instance
            .collection('threads')
            .where('accountId', isEqualTo: _selectedAccountId)
            .limit(1)
            .get();
        setState(() {
          _threadCount = threadsSnapshot.size;
        });
      }
    } catch (e) {
      setState(() {
        _lastError = e.toString();
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<String?> _getTokenStatus() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;
    try {
      final token = await user.getIdToken();
      return (token?.isNotEmpty ?? false) ? 'Present (${token?.length ?? 0} chars)' : 'Empty';
    } catch (e) {
      return 'Error: $e';
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) {
      return const Scaffold(
        body: Center(child: Text('Diagnostics only available in debug mode')),
      );
    }

    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp Diagnostics'),
        backgroundColor: Colors.orange,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDiagnostics,
            tooltip: 'Refresh',
          ),
          IconButton(
            icon: const Icon(Icons.copy),
            onPressed: _copyAuthTokensToClipboard,
            tooltip: 'Copy Auth Tokens',
          ),
          IconButton(
            icon: const Icon(Icons.verified),
            onPressed: _validateClipboardTokens,
            tooltip: 'Validate Clipboard Tokens',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSection('Auth Status', [
                    _buildInfoRow('User UID', user?.uid ?? 'Not logged in'),
                    _buildInfoRow('User Email', user?.email ?? 'N/A'),
                    FutureBuilder<String?>(
                      future: _getTokenStatus(),
                      builder: (context, snapshot) {
                        return _buildInfoRow(
                          'Token Status',
                          snapshot.data ?? 'Checking...',
                        );
                      },
                    ),
                    _buildInfoRow(
                      'Clipboard Token Valid',
                      _clipboardTokenStatus,
                    ),
                  ]),
                  const SizedBox(height: 24),
                  _buildSection('API Status', [
                    if (_lastError != null)
                      _buildInfoRow('Last Error', _lastError!, isError: true),
                    _buildInfoRow(
                      'Last getMessages Status',
                      _apiService.lastGetMessagesStatus?.toString() ?? 'N/A',
                    ),
                    if (_lastAccountsResponse != null) ...[
                      _buildInfoRow(
                        'Accounts Count',
                        '${(_lastAccountsResponse!['accounts'] as List?)?.length ?? 0}',
                      ),
                      _buildInfoRow(
                        'Success',
                        '${_lastAccountsResponse!['success'] ?? false}',
                      ),
                    ],
                  ]),
                  const SizedBox(height: 24),
                  _buildSection('Firestore Status', [
                    if (_selectedAccountId != null) ...[
                      _buildInfoRow('Selected AccountId', _selectedAccountId!),
                      _buildInfoRow(
                        'Threads Count',
                        _threadCount?.toString() ?? 'Not loaded',
                      ),
                    ] else
                      _buildInfoRow('Selected AccountId', 'None'),
                  ]),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: _loadDiagnostics,
                    child: const Text('Refresh Diagnostics'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        ...children,
      ],
    );
  }

  Widget _buildInfoRow(String label, String value, {bool isError = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              '$label:',
              style: TextStyle(
                fontWeight: FontWeight.w500,
                color: isError ? Colors.red : null,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                color: isError ? Colors.red : null,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
