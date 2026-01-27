import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/errors/app_exception.dart';
import '../../services/admin_service.dart';
import '../../services/whatsapp_api_service.dart';
import '../../services/whatsapp_backfill_manager.dart';

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
  final AdminService _adminService = AdminService();
  Map<String, dynamic>? _lastAccountsResponse;
  String? _lastError;
  bool _isLoading = false;
  bool _isAdmin = false;
  bool _isBackfilling = false;
  int? _threadCount;
  String? _selectedAccountId;
  List<Map<String, dynamic>> _accounts = [];
  String _clipboardTokenStatus = 'Not checked';
  int? _connectedCount;
  int? _lastInboundAgeSec;
  int? _threadsApiCount;
  String? _threadsApiFirstJson;
  String? _threadsApiError;

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
      _threadsApiCount = null;
      _threadsApiFirstJson = null;
      _threadsApiError = null;
    });

    try {
      final adminFuture = _adminService.isCurrentUserAdmin();
      // Test getAccounts API
      final response = await _apiService.getAccounts();
      final accounts = (response['accounts'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();
      final connected = accounts
          .where((acc) => acc['status'] == 'connected')
          .length;
      final isAdmin = await adminFuture;

      setState(() {
        _lastAccountsResponse = response;
        _accounts = accounts;
        _isAdmin = isAdmin;
        _connectedCount = connected;
        if (accounts.isEmpty) {
          _selectedAccountId = null;
        } else {
          final ids = accounts.map((a) => a['id'] as String?).whereType<String>().toList();
          if (_selectedAccountId == null || !ids.contains(_selectedAccountId)) {
            _selectedAccountId = ids.first;
          }
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

        try {
          final baseQuery = FirebaseFirestore.instance
              .collectionGroup('messages')
              .where('accountId', isEqualTo: _selectedAccountId)
              .where('direction', isEqualTo: 'inbound');
          QuerySnapshot<Map<String, dynamic>> inboundSnapshot;
          try {
            inboundSnapshot =
                await baseQuery.orderBy('tsClientMs', descending: true).limit(1).get();
          } catch (_) {
            inboundSnapshot =
                await baseQuery.orderBy('tsClient', descending: true).limit(1).get();
          }
          if (inboundSnapshot.docs.isNotEmpty) {
            final data = inboundSnapshot.docs.first.data();
            final tsMs = _extractMillis(
              data['tsClientMs'] ?? data['createdAtMs'] ?? data['tsClient'] ?? data['createdAt'],
            );
            if (tsMs != null) {
              final ageSec =
                  ((DateTime.now().millisecondsSinceEpoch - tsMs) / 1000).round();
              setState(() {
                _lastInboundAgeSec = ageSec;
              });
            }
          }
        } catch (e) {
          setState(() {
            _lastError = 'Inbound age query failed';
          });
        }

        try {
          final threadsRes = await _apiService.getThreads(accountId: _selectedAccountId!);
          final list = threadsRes['threads'] as List<dynamic>? ?? [];
          final first = list.isNotEmpty ? list.first : null;
          String? firstJson;
          if (first != null) {
            try {
              firstJson = const JsonEncoder.withIndent(' ').convert(
                first is Map ? first : <String, dynamic>{},
              );
              if (firstJson.length > 600) {
                firstJson = '${firstJson.substring(0, 600)}…';
              }
            } catch (_) {
              firstJson = first.toString();
            }
          }
          setState(() {
            _threadsApiCount = (threadsRes['count'] as int?) ?? list.length;
            _threadsApiFirstJson = firstJson;
            _threadsApiError = null;
          });
        } catch (e) {
          setState(() {
            _threadsApiError = e.toString();
            _threadsApiCount = null;
            _threadsApiFirstJson = null;
          });
        }
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

  Future<void> _runBackfill() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Trebuie să fii autentificat.')),
      );
      return;
    }
    if (_selectedAccountId == null || _selectedAccountId!.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selectează un cont.')),
      );
      return;
    }
    if (_isBackfilling) return;
    setState(() => _isBackfilling = true);
    try {
      final res = await _apiService.backfillAccount(accountId: _selectedAccountId!);
      if (kDebugMode) {
        debugPrint('[WhatsAppDiagnostics] backfill success: $res');
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Backfill pornit. Deschide un thread pentru mesaje.')),
      );
      await _loadDiagnostics();
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('[WhatsAppDiagnostics] backfill error: $e');
        debugPrint('[WhatsAppDiagnostics] backfill stackTrace: $st');
      }
      if (!mounted) return;
      String msg;
      if (e is UnauthorizedException || e is ForbiddenException) {
        msg = 'Necesită super-admin.';
      } else {
        msg = e.toString();
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: Colors.red[700]),
      );
    } finally {
      if (mounted) setState(() => _isBackfilling = false);
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

  int? _extractMillis(dynamic raw) {
    if (raw == null) return null;
    if (raw is int) return raw;
    if (raw is Timestamp) return raw.millisecondsSinceEpoch;
    if (raw is String) {
      final parsed = int.tryParse(raw);
      if (parsed != null) {
        return parsed < 1000000000000 ? parsed * 1000 : parsed;
      }
      final dt = DateTime.tryParse(raw);
      return dt?.millisecondsSinceEpoch;
    }
    return null;
  }

  String _formatAge(DateTime dt) {
    final d = DateTime.now().difference(dt);
    if (d.inMinutes < 1) return '<1m';
    if (d.inMinutes < 60) return '${d.inMinutes}m';
    if (d.inHours < 24) return '${d.inHours}h';
    if (d.inDays < 7) return '${d.inDays}d';
    return '${d.inDays}d';
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
                      'Connected Accounts',
                      _connectedCount?.toString() ?? 'N/A',
                    ),
                    _buildInfoRow(
                      'Last inbound age (sec)',
                      _lastInboundAgeSec?.toString() ?? 'N/A',
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
                  _buildSection('Threads API (verify no data lost)', [
                    if (_threadsApiError != null)
                      _buildInfoRow('Threads API Error', _threadsApiError!, isError: true),
                    _buildInfoRow(
                      'Threads API Count',
                      _threadsApiCount?.toString() ?? '—',
                    ),
                    if (_threadsApiFirstJson != null) ...[
                      const SizedBox(height: 8),
                      const Text('First thread (JSON):', style: TextStyle(fontWeight: FontWeight.w500)),
                      const SizedBox(height: 4),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.grey[200],
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: SelectableText(
                          _threadsApiFirstJson!,
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
                        ),
                      ),
                    ],
                  ]),
                  if (_isAdmin) ...[
                    const SizedBox(height: 24),
                    _buildSection('Backfill', [
                      if (_accounts.isNotEmpty) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              const SizedBox(
                                width: 120,
                                child: Text('Cont:', style: TextStyle(fontWeight: FontWeight.w500)),
                              ),
                              Expanded(
                                child: DropdownButton<String>(
                                  value: _selectedAccountId,
                                  isExpanded: true,
                                  items: _accounts
                                      .where((a) =>
                                          a['id'] is String &&
                                          (a['id'] as String).isNotEmpty)
                                      .map((a) {
                                        final id = a['id'] as String;
                                        final name =
                                            a['name'] as String? ?? id;
                                        return DropdownMenuItem<String>(
                                          value: id,
                                          child: Text('$id • $name'),
                                        );
                                      })
                                      .toList(),
                                  onChanged: (v) {
                                    setState(() => _selectedAccountId = v);
                                  },
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (_selectedAccountId != null) ...[
                        const SizedBox(height: 8),
                        FutureBuilder<DateTime?>(
                          future: WhatsAppBackfillManager.instance
                              .getLastAttemptAt(_selectedAccountId!),
                          builder: (context, snap) {
                            String v = '…';
                            if (snap.hasData) {
                              final dt = snap.data;
                              v = dt == null
                                  ? 'Never'
                                  : '${_formatAge(dt)} ago';
                            } else if (snap.hasError) {
                              v = 'Error: ${snap.error}';
                            }
                            return _buildInfoRow(
                              'Last backfill attempt (app)',
                              v,
                            );
                          },
                        ),
                      ],
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        onPressed: (_isBackfilling || _selectedAccountId == null)
                            ? null
                            : _runBackfill,
                        icon: _isBackfilling
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.sync),
                        label: Text(_isBackfilling ? 'Se sincronizează…' : 'Sync / Backfill history'),
                      ),
                    ]),
                  ],
                  if (kDebugMode) ...[
                    const SizedBox(height: 24),
                    _buildSection('Debug', [
                      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                        stream: FirebaseFirestore.instance
                            .collection('app_config')
                            .doc('ai_prompts')
                            .snapshots(),
                        builder: (context, snap) {
                          if (snap.hasError) {
                            return _buildInfoRow('AI prompts version', '—');
                          }
                          if (!snap.hasData) {
                            return _buildInfoRow('AI prompts version', '…');
                          }
                          final data = snap.data?.data();
                          final v = data?['version'];
                          return _buildInfoRow(
                            'AI prompts version',
                            v != null ? v.toString() : '—',
                          );
                        },
                      ),
                    ]),
                  ],
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
