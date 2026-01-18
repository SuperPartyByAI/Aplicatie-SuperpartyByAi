import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/whatsapp_api_service.dart';
import '../../core/errors/app_exception.dart';

/// WhatsApp Accounts Management Screen
/// 
/// Super-admin only: view accounts, add accounts, regenerate QR codes.
class WhatsAppAccountsScreen extends StatefulWidget {
  const WhatsAppAccountsScreen({super.key});

  @override
  State<WhatsAppAccountsScreen> createState() => _WhatsAppAccountsScreenState();
}

class _WhatsAppAccountsScreenState extends State<WhatsAppAccountsScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;

  List<Map<String, dynamic>> _accounts = [];
  bool _isLoading = true;
  String? _error;
  
  // Backend mode info (from getAccounts response)
  String? _backendMode; // 'active' | 'passive' | null
  String? _backendInstanceId;
  
  // In-flight guards (prevent double-tap / concurrent requests)
  bool _isAddingAccount = false;
  final Set<String> _regeneratingQr = {}; // accountId -> in-flight
  final Set<String> _deletingAccount = {}; // accountId -> in-flight
  int _loadRequestToken = 0;

  // Polling for waiting_qr/qr_ready/connecting states
  Timer? _pollingTimer;
  DateTime? _pollingStartTime;
  static const _maxPollingDuration = Duration(minutes: 2);
  static const _pollingInterval = Duration(seconds: 3);

  @override
  void initState() {
    super.initState();
    debugPrint('[WhatsAppAccountsScreen] initState: loading accounts');
    _loadAccounts();
  }

  @override
  void dispose() {
    _stopPolling();
    super.dispose();
  }

  Future<void> _loadAccounts() async {
    final myToken = ++_loadRequestToken;
    
    debugPrint('[WhatsAppAccountsScreen] _loadAccounts: starting (token=$myToken)');
    
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      debugPrint('[WhatsAppAccountsScreen] _loadAccounts: calling getAccounts()');
      final response = await _apiService.getAccounts();
      
      debugPrint('[WhatsAppAccountsScreen] _loadAccounts: response received (token=$myToken, success=${response['success']}, accountsCount=${(response['accounts'] as List?)?.length ?? 0})');
      
      // Ignore late responses (if another load started)
      if (myToken != _loadRequestToken) {
        debugPrint('[WhatsAppAccountsScreen] _loadAccounts: ignoring late response (token mismatch)');
        return;
      }
      
      if (response['success'] == true) {
        final accounts = response['accounts'] as List<dynamic>? ?? [];
        debugPrint('[WhatsAppAccountsScreen] _loadAccounts: success, ${accounts.length} accounts');
        
        // Extract backend mode info
        final backendMode = response['waMode'] as String?;
        final backendInstanceId = response['instanceId'] as String?;
        debugPrint('[WhatsAppAccountsScreen] Backend mode: $backendMode, instanceId: $backendInstanceId');
        
        // Log account statuses for debugging
        for (final account in accounts) {
          final acc = account as Map<String, dynamic>;
          debugPrint('[WhatsAppAccountsScreen] Account: id=${acc['id']}, status=${acc['status']}, hasQR=${acc['qrCode'] != null}');
        }
        
        if (mounted && myToken == _loadRequestToken) {
          setState(() {
            _accounts = accounts.cast<Map<String, dynamic>>();
            _backendMode = backendMode;
            _backendInstanceId = backendInstanceId;
            _isLoading = false;
          });
          // Start polling if needed after accounts update
          _startPollingIfNeeded();
        }
      } else {
        debugPrint('[WhatsAppAccountsScreen] _loadAccounts: failed - ${response['message']}');
        if (mounted && myToken == _loadRequestToken) {
          setState(() {
            _error = response['message'] ?? 'Failed to load accounts';
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      debugPrint('[WhatsAppAccountsScreen] _loadAccounts: exception - $e');
      // Ignore late responses
      if (myToken != _loadRequestToken) {
        debugPrint('[WhatsAppAccountsScreen] _loadAccounts: ignoring late exception (token mismatch)');
        return;
      }
      
      if (mounted) {
        String errorMessage = 'Error: ${e.toString()}';
        
        // Special handling for ServiceUnavailableException (503 - PASSIVE mode)
        if (e is ServiceUnavailableException) {
          errorMessage = e.mode == 'passive'
              ? 'Backend în mod PASSIVE (lock nu este achiziționat). Reîncearcă în câteva secunde.'
              : e.message;
        }
        
        setState(() {
          _error = errorMessage;
          _isLoading = false;
        });
      }
    }
  }

  /// Start polling if any account is in waiting_qr/qr_ready/connecting state
  void _startPollingIfNeeded() {
    // Check if any account needs polling
    final needsPolling = _accounts.any((acc) {
      final status = acc['status'] as String?;
      return status == 'waiting_qr' || status == 'qr_ready' || status == 'connecting' || status == 'needs_qr';
    });
    
    if (needsPolling && _pollingTimer == null) {
      _pollingStartTime = DateTime.now();
      _pollingTimer = Timer.periodic(_pollingInterval, (_) => _pollAccountsIfNeeded());
      debugPrint('[WhatsAppAccountsScreen] Polling started (accounts in waiting_qr/qr_ready/connecting)');
    } else if (!needsPolling && _pollingTimer != null) {
      _stopPolling();
    }
  }

  /// Stop polling timer
  void _stopPolling() {
    if (_pollingTimer != null) {
      _pollingTimer?.cancel();
      _pollingTimer = null;
      _pollingStartTime = null;
      debugPrint('[WhatsAppAccountsScreen] Polling stopped');
    }
  }

  /// Poll accounts if needed (called by timer)
  Future<void> _pollAccountsIfNeeded() async {
    if (!mounted) {
      _stopPolling();
      return;
    }

    // Check timeout
    if (_pollingStartTime != null &&
        DateTime.now().difference(_pollingStartTime!) > _maxPollingDuration) {
      debugPrint('[WhatsAppAccountsScreen] Polling timeout (${_maxPollingDuration.inMinutes}min), stopping');
      _stopPolling();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Polling timeout - please refresh manually'),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 5),
          ),
        );
      }
      return;
    }
    
    // Check if still needed
    final needsPolling = _accounts.any((acc) {
      final status = acc['status'] as String?;
      return status == 'waiting_qr' || status == 'qr_ready' || status == 'connecting' || status == 'needs_qr';
    });
    
    if (!needsPolling) {
      debugPrint('[WhatsAppAccountsScreen] No accounts need polling, stopping');
      _stopPolling();
      return;
    }
    
    // Poll silently (don't show loading spinner)
    debugPrint('[WhatsAppAccountsScreen] Polling accounts (interval: ${_pollingInterval.inSeconds}s)');
    try {
      final response = await _apiService.getAccounts();
      
      if (response['success'] == true && mounted) {
        final accounts = response['accounts'] as List<dynamic>? ?? [];
        setState(() {
          _accounts = accounts.cast<Map<String, dynamic>>();
        });
        // Recheck polling after update
        _startPollingIfNeeded();
      }
    } catch (e) {
      debugPrint('[WhatsAppAccountsScreen] Polling error: $e (will retry on next interval)');
      // Don't stop polling on error - retry on next interval
      // But check if we should use exponential backoff
    }
  }

  Future<void> _addAccount() async {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add WhatsApp Account'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Account Name',
                hintText: 'e.g., Main Account',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: phoneController,
              decoration: const InputDecoration(
                labelText: 'Phone Number',
                hintText: 'e.g., +407123456789',
              ),
              keyboardType: TextInputType.phone,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              if (nameController.text.isNotEmpty && phoneController.text.isNotEmpty) {
                Navigator.pop(context, true);
              }
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );

    if (result != true) {
      debugPrint('[WhatsAppAccountsScreen] _addAccount: cancelled');
      return;
    }

    // Guard: prevent double-tap
    if (_isAddingAccount) {
      debugPrint('[WhatsAppAccountsScreen] _addAccount: already in progress, skipping');
      return;
    }
    
    debugPrint('[WhatsAppAccountsScreen] _addAccount: starting (name=${nameController.text.trim()}, phone=${phoneController.text.trim()})');
    setState(() => _isAddingAccount = true);

    try {
      final response = await _apiService.addAccount(
        name: nameController.text.trim(),
        phone: phoneController.text.trim(),
      );

      debugPrint('[WhatsAppAccountsScreen] _addAccount: response received (success=${response['success']}, accountId=${response['account']?['id'] ?? response['accountId']})');

      if (mounted) {
        if (response['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Account added successfully'),
              backgroundColor: Colors.green,
            ),
          );
          debugPrint('[WhatsAppAccountsScreen] _addAccount: success, reloading accounts');
          await _loadAccounts();
        } else {
          debugPrint('[WhatsAppAccountsScreen] _addAccount: failed - ${response['message']}');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(response['message'] ?? 'Failed to add account'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('[WhatsAppAccountsScreen] _addAccount: exception - $e');
      if (mounted) {
        String errorMessage = 'Error: ${e.toString()}';
        Color backgroundColor = Colors.red;
        
        // Special handling for ServiceUnavailableException (503 - PASSIVE mode)
        if (e is ServiceUnavailableException) {
          errorMessage = e.mode == 'passive'
              ? 'Backend în mod PASSIVE. Lock nu este achiziționat. Reîncearcă în câteva secunde.'
              : e.message;
          backgroundColor = Colors.purple; // Purple for PASSIVE mode
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: backgroundColor,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isAddingAccount = false);
      }
    }
  }

  // Throttle map: accountId -> last regenerate timestamp
  final Map<String, DateTime> _regenerateThrottle = {};
  static const _regenerateThrottleSeconds = 5; // Minimum 5 seconds between regenerates

  Future<void> _regenerateQr(String accountId) async {
    // Guard: prevent double-tap
    if (_regeneratingQr.contains(accountId)) {
      debugPrint('[WhatsAppAccountsScreen] _regenerateQr: already in progress for $accountId');
      return;
    }
    
    // CRITICAL FIX: Get current account status to block regenerate if already pairing/paired
    final account = _accounts.firstWhere((acc) => acc['id'] == accountId, orElse: () => {});
    final currentStatus = account['status'] as String?;
    
    // Throttle: prevent spamming regenerateQr
    final lastRegenerate = _regenerateThrottle[accountId];
    if (lastRegenerate != null) {
      final secondsSinceLast = DateTime.now().difference(lastRegenerate).inSeconds;
      if (secondsSinceLast < _regenerateThrottleSeconds) {
        final remaining = _regenerateThrottleSeconds - secondsSinceLast;
        debugPrint('[WhatsAppAccountsScreen] _regenerateQr: throttled (${remaining}s remaining)');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Please wait ${remaining}s before regenerating QR again'),
              backgroundColor: Colors.orange,
              duration: Duration(seconds: remaining),
            ),
          );
        }
        return;
      }
    }
    
    debugPrint('[WhatsAppAccountsScreen] _regenerateQr: starting for accountId=$accountId, currentStatus=$currentStatus');
    _regenerateThrottle[accountId] = DateTime.now();
    setState(() => _regeneratingQr.add(accountId));

    try {
      final response = await _apiService.regenerateQr(
        accountId: accountId,
        currentStatus: currentStatus,
      );

      debugPrint('[WhatsAppAccountsScreen] _regenerateQr: response received (success=${response['success']}, message=${response['message']}, error=${response['error']}, mode=${response['mode']})');

      if (mounted) {
        if (response['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('QR regeneration started'),
              backgroundColor: Colors.green,
            ),
          );
          // Reload accounts to get new QR code
          debugPrint('[WhatsAppAccountsScreen] _regenerateQr: waiting 2s then reloading accounts');
          await Future.delayed(const Duration(seconds: 2));
          await _loadAccounts();
        } else {
          final errorMessage = response['message'] ?? response['backendMessage'] ?? 'Failed to regenerate QR';
          final errorMode = response['mode'];
          final backendError = response['error'] ?? response['backendError'];
          
          debugPrint('[WhatsAppAccountsScreen] _regenerateQr: failed - $errorMessage (error=$backendError, mode=$errorMode)');
          
          // Special handling for PASSIVE mode
          if (errorMode == 'passive' || backendError == 'PASSIVE mode') {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Backend in PASSIVE mode: ${response['message'] ?? 'Lock not acquired. Retry shortly.'}'),
                backgroundColor: Colors.purple,
                duration: const Duration(seconds: 5),
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(errorMessage),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      }
    } catch (e) {
      debugPrint('[WhatsAppAccountsScreen] _regenerateQr: exception - $e');
      
      // Special handling for ServiceUnavailableException (503 - PASSIVE mode or 429 - rate limited)
      if (e is ServiceUnavailableException) {
        if (e.mode == 'passive') {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Backend în mod PASSIVE. Lock nu este achiziționat. Reîncearcă în câteva secunde.'),
                backgroundColor: Colors.purple,
                duration: const Duration(seconds: 5),
              ),
            );
          }
          return; // Don't show generic error for PASSIVE mode
        } else if (e.retryAfterSeconds != null) {
          // 429 rate limited - show friendly message with retry time
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(e.message ?? 'Please wait ${e.retryAfterSeconds}s before regenerating QR again'),
                backgroundColor: Colors.orange,
                duration: Duration(seconds: e.retryAfterSeconds!),
              ),
            );
          }
          return; // Don't show generic error for rate limit
        }
      }
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _regeneratingQr.remove(accountId));
      }
    }
  }

  Future<void> _deleteAccount(String accountId, String accountName) async {
    // Guard: prevent double-tap
    if (_deletingAccount.contains(accountId) || _isAddingAccount) return;
    
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Account?'),
        content: Text('This will permanently delete "$accountName". This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _deletingAccount.add(accountId));

    try {
      await _apiService.deleteAccount(accountId: accountId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Account deleted successfully'),
            backgroundColor: Colors.green,
          ),
        );
        await _loadAccounts();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Delete failed: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _openQrPage(String accountId) async {
    final url = _apiService.qrPageUrl(accountId);
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not open QR page: $url'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    }
  }

  Widget _buildAccountCard(Map<String, dynamic> account) {
    final id = account['id'] as String? ?? 'unknown';
    final name = account['name'] as String? ?? 'Unnamed';
    final phone = account['phone'] as String? ?? '';
    final status = account['status'] as String? ?? 'unknown';
    final qrCode = account['qrCode'] as String?;
    final pairingCode = account['pairingCode'] as String?;
    final lastError = account['lastError'] as String?;
    final passiveModeReason = account['passiveModeReason'] as String?;

    final statusColor = _getStatusColor(status);
    final showQr = status == 'qr_ready' && qrCode != null;
    // When showQr is true, qrCode is guaranteed non-null
    final qrCodeData = qrCode ?? '';
    
    // Show passive mode warning if status is passive
    final isPassive = status == 'passive' || passiveModeReason != null;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (phone.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          phone,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: statusColor),
                  ),
                  child: Text(
                    _getStatusDisplayText(status),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: statusColor,
                    ),
                  ),
                ),
              ],
            ),
            // Show account status and last error
            if (status != 'connected' && (lastError != null || status != 'unknown')) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: status == 'passive' 
                      ? Colors.purple.withValues(alpha: 0.1)
                      : status == 'disconnected'
                          ? Colors.red.withValues(alpha: 0.1)
                          : Colors.orange.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: status == 'passive' 
                        ? Colors.purple
                        : status == 'disconnected'
                            ? Colors.red
                            : Colors.orange,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          status == 'passive' 
                              ? Icons.pause_circle
                              : status == 'disconnected'
                                  ? Icons.error_outline
                                  : Icons.info_outline,
                          color: status == 'passive' 
                              ? Colors.purple
                              : status == 'disconnected'
                                  ? Colors.red
                                  : Colors.orange,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          status == 'passive' 
                              ? 'Backend in PASSIVE mode'
                              : status == 'disconnected'
                                  ? 'Account Disconnected'
                                  : 'Account Status: ${status.toUpperCase()}',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: status == 'passive' 
                                ? Colors.purple
                                : status == 'disconnected'
                                    ? Colors.red
                                    : Colors.orange,
                          ),
                        ),
                      ],
                    ),
                    if (lastError != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        lastError!,
                        style: TextStyle(
                          fontSize: 12,
                          color: status == 'passive' 
                              ? Colors.purple
                              : status == 'disconnected'
                                  ? Colors.red
                                  : Colors.orange,
                        ),
                      ),
                    ],
                    if (passiveModeReason != null && status == 'passive') ...[
                      const SizedBox(height: 4),
                      Text(
                        'Reason: $passiveModeReason',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Colors.purple,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                    if (status == 'passive') ...[
                      const SizedBox(height: 4),
                      const Text(
                        'Backend will retry lock acquisition automatically. Accounts cannot connect until backend is ACTIVE.',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.purple,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            // Show logged_out/needs_qr UI with "Delete & Re-add" button
            if (status == 'logged_out' || (status == 'needs_qr' && !showQr)) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: Colors.red,
                          size: 24,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Session expired - re-link required',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.red,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                status == 'logged_out'
                                    ? 'Your WhatsApp session has expired. Please delete and re-add this account to connect again.'
                                    : 'This account needs a new QR code. Please delete and re-add to generate a fresh QR.',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.red,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _deletingAccount.contains(id) || _isAddingAccount
                            ? null
                            : () => _deleteAccount(id, name),
                        icon: const Icon(Icons.delete_outline, size: 18),
                        label: const Text('Delete & Re-add'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (showQr) ...[
              const SizedBox(height: 16),
              Center(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey[300]!),
                  ),
                  child: _buildQrWidget(qrCodeData),
                ),
              ),
              const SizedBox(height: 8),
              const Center(
                child: Text(
                  'Scan this QR code with WhatsApp',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ),
            ],
            if (pairingCode != null && !showQr) ...[
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Pairing Code: $pairingCode',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (!showQr && status == 'qr_ready')
                  TextButton.icon(
                    onPressed: () => _openQrPage(id),
                    icon: const Icon(Icons.qr_code, size: 18),
                    label: const Text('Open QR Page'),
                  )
                else
                  const SizedBox.shrink(),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Don't show "Regenerate QR" for logged_out accounts (they need Delete & Re-add)
                    if (status != 'logged_out')
                      TextButton.icon(
                        onPressed: _regeneratingQr.contains(id) || _isAddingAccount
                            ? null
                            : () => _regenerateQr(id),
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Regenerate QR'),
                      ),
                    if (status != 'logged_out') const SizedBox(width: 8),
                    IconButton(
                      onPressed: _deletingAccount.contains(id) || _isAddingAccount
                          ? null
                          : () => _deleteAccount(id, name),
                      icon: const Icon(Icons.delete_outline, size: 20),
                      color: Colors.red,
                      tooltip: 'Delete account',
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Build QR widget - supports both base64 images and QR code strings
  Widget _buildQrWidget(String qrCodeData) {
    // Check if qrCodeData is a base64 image (starts with "data:image/")
    if (qrCodeData.startsWith('data:image/')) {
      try {
        // Extract base64 part (after comma)
        final base64String = qrCodeData.contains(',') 
            ? qrCodeData.split(',').last 
            : qrCodeData;
        final bytes = base64Decode(base64String);
        return Image.memory(
          bytes,
          width: 200,
          height: 200,
          fit: BoxFit.contain,
        );
      } catch (e) {
        // Fallback to QR code generation if base64 decode fails
        return QrImageView(
          data: qrCodeData.substring(0, qrCodeData.length < 1000 ? qrCodeData.length : 1000),
          version: QrVersions.auto,
          size: 200,
        );
      }
    } else {
      // Regular QR code string - generate QR code
      return QrImageView(
        data: qrCodeData,
        version: QrVersions.auto,
        size: 200,
      );
    }
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'connected':
        return Colors.green;
      case 'qr_ready':
        return Colors.orange;
      case 'awaiting_scan':
        return Colors.orange; // Same as qr_ready (pairing phase)
      case 'connecting':
        return Colors.blue;
      case 'disconnected':
        return Colors.red;
      case 'logged_out':
        return Colors.red; // Same as disconnected (needs re-link)
      case 'passive':
        return Colors.purple; // Purple for passive mode
      case 'needs_qr':
        return Colors.amber;
      default:
        return Colors.grey;
    }
  }
  
  String _getStatusDisplayText(String status) {
    switch (status.toLowerCase()) {
      case 'passive':
        return 'PASSIVE (Backend not active)';
      case 'needs_qr':
        return 'NEEDS QR';
      case 'logged_out':
        return 'LOGGED OUT';
      default:
        return status.toUpperCase();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp Accounts'),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          if (!_isLoading && _error == null)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadAccounts,
              tooltip: 'Refresh',
            ),
        ],
        bottom: _backendMode != null
            ? PreferredSize(
                preferredSize: const Size.fromHeight(32),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  color: _backendMode == 'active' 
                      ? Colors.green.withValues(alpha: 0.2)
                      : Colors.purple.withValues(alpha: 0.2),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _backendMode == 'active' ? Icons.check_circle : Icons.pause_circle,
                        size: 16,
                        color: _backendMode == 'active' ? Colors.green : Colors.purple,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Backend: ${_backendMode?.toUpperCase() ?? 'UNKNOWN'}${_backendInstanceId != null ? ' (${_backendInstanceId!.substring(0, 8)}...)': ''}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: _backendMode == 'active' ? Colors.green[700] : Colors.purple[700],
                        ),
                      ),
                    ],
                  ),
                ),
              )
            : null,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
              : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          _error!.contains('PASSIVE') ? Icons.pause_circle_outline : Icons.error_outline,
                          size: 64,
                          color: _error!.contains('PASSIVE') ? Colors.purple[300] : Colors.red[300],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _error!,
                          style: const TextStyle(fontSize: 16),
                          textAlign: TextAlign.center,
                        ),
                        if (_error!.contains('PASSIVE')) ...[
                          const SizedBox(height: 8),
                          const Text(
                            'Backend-ul va încerca automat să achiziționeze lock-ul.',
                            style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
                            textAlign: TextAlign.center,
                          ),
                        ],
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: _loadAccounts,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : _accounts.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.account_circle_outlined,
                            size: 64,
                            color: Colors.grey[400],
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'No accounts found',
                            style: TextStyle(
                              fontSize: 18,
                              color: Colors.grey[600],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Add your first WhatsApp account',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey[500],
                            ),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadAccounts,
                      child: ListView.builder(
                        itemCount: _accounts.length,
                        itemBuilder: (context, index) {
                          return _buildAccountCard(_accounts[index]);
                        },
                      ),
                    ),
      floatingActionButton: _isLoading || _error != null
          ? null
          : FloatingActionButton.extended(
              onPressed: _isAddingAccount ? null : _addAccount,
              icon: _isAddingAccount
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Icon(Icons.add),
              label: Text(_isAddingAccount ? 'Adding...' : 'Add Account'),
              backgroundColor: const Color(0xFF25D366),
            ),
    );
  }
}
