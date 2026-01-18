import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:path/path.dart' as path;
import '../../services/whatsapp_api_service.dart';
import '../../services/whatsapp_backend_diagnostics_service.dart';
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
  final WhatsAppBackendDiagnosticsService _diagnosticsService =
      WhatsAppBackendDiagnosticsService.instance;

  List<Map<String, dynamic>> _accounts = [];
  bool _isLoading = true;
  String? _error;
  BackendDiagnostics? _backendDiagnostics;
  
  // In-flight guards (prevent double-tap / concurrent requests)
  bool _isAddingAccount = false;
  final Set<String> _regeneratingQr = {}; // accountId -> in-flight
  final Set<String> _deletingAccount = {}; // accountId -> in-flight
  final Set<String> _openingFirefox = {}; // accountId -> in-flight
  int _loadRequestToken = 0;
  
  static const String _waUrl = 'https://web.whatsapp.com';
  
  /// Get path to firefox-container script
  /// 
  /// Priority:
  /// 1. WA_WEB_LAUNCHER_PATH environment variable
  /// 2. Repo-relative path: <repo-root>/scripts/wa_web_launcher/firefox-container
  ///    (calculated from Flutter app directory, assuming repo structure)
  /// 3. Fallback: <home>/wa-web-launcher/bin/firefox-container (original location)
  /// 
  /// The script should be executable and located in the repo or configured via env var.
  static String _getFirefoxContainerScriptPath() {
    // Check environment variable first
    final envPath = Platform.environment['WA_WEB_LAUNCHER_PATH'];
    if (envPath != null && envPath.isNotEmpty) {
      if (kDebugMode) {
        debugPrint('[WhatsAppAccountsScreen] Using WA_WEB_LAUNCHER_PATH: $envPath');
      }
      return envPath;
    }
    
    // Try repo-relative path: go up from superparty_flutter/lib to repo root
    // Path structure: <repo-root>/superparty_flutter/lib/... -> <repo-root>/scripts/wa_web_launcher/firefox-container
    // In production, we can't reliably detect repo root, so use a fallback heuristic
    final currentDir = Directory.current.path;
    final repoRoot = path.normalize(path.join(currentDir, '..', '..', '..'));
    final repoPath = path.join(repoRoot, 'scripts', 'wa_web_launcher', 'firefox-container');
    final absoluteRepoPath = path.absolute(repoPath);
    
    if (kDebugMode) {
      debugPrint('[WhatsAppAccountsScreen] Checking repo-relative script path: $absoluteRepoPath');
    }
    
    // Return repo path - async method will check existence and handle fallback if needed
    return absoluteRepoPath;
  }

  @override
  void initState() {
    super.initState();
    _loadAccounts();
    _checkBackendDiagnostics();
  }
  
  Future<void> _checkBackendDiagnostics() async {
    try {
      final diagnostics = await _diagnosticsService.checkReady();
      if (mounted) {
        setState(() {
          _backendDiagnostics = diagnostics;
        });
      }
    } catch (e) {
      if (mounted) {
        if (kDebugMode) {
          debugPrint('[WhatsAppAccountsScreen] Diagnostics check failed: $e');
        }
      }
    }
  }

  Future<void> _loadAccounts() async {
    final myToken = ++_loadRequestToken;
    
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // Add timeout to prevent infinite loading
      final response = await _apiService.getAccounts().timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          throw TimeoutException('Request timed out after 10 seconds');
        },
      );
      
      // Ignore late responses (if another load started)
      if (myToken != _loadRequestToken) return;
      
      if (response['success'] == true) {
        final accounts = response['accounts'] as List<dynamic>? ?? [];
        if (mounted && myToken == _loadRequestToken) {
          setState(() {
            _accounts = accounts.cast<Map<String, dynamic>>();
            _isLoading = false;
            _error = null;
          });
        }
      } else {
        if (mounted && myToken == _loadRequestToken) {
          setState(() {
            _error = response['message'] ?? 'Failed to load accounts';
            _isLoading = false;
          });
          if (kDebugMode) {
            debugPrint('[WhatsAppAccountsScreen] _loadAccounts: set error state - $_error');
          }
        }
      }
    } catch (e) {
      // Ignore late responses
      if (myToken != _loadRequestToken) {
        if (kDebugMode) {
          debugPrint('[WhatsAppAccountsScreen] _loadAccounts: ignoring late response (token mismatch)');
        }
        return;
      }
      
      if (mounted) {
        String errorMessage;
        if (e is AppException) {
          errorMessage = e.message;
        } else if (e is TimeoutException) {
          errorMessage = 'Request timed out. Backend may be down or slow.';
        } else {
          errorMessage = 'Error: ${e.toString()}';
        }
        
        // Check if error is related to backend being down (502) or passive (503)
        String? backendStatusHint;
        if (e is NetworkException) {
          if (e.code == '502' || e.message.contains('502')) {
            backendStatusHint = 'Backend is down (502 Bad Gateway). Check Railway service status.';
          } else if (e.code == '503' || e.message.contains('503') || e.message.contains('passive')) {
            backendStatusHint = 'Backend is in PASSIVE mode (503). Another instance holds the lock.';
          }
        }
        
        if (kDebugMode) {
          debugPrint('[WhatsAppAccountsScreen] _loadAccounts: caught exception - $errorMessage');
        }
        
        setState(() {
          _error = errorMessage;
          if (backendStatusHint != null) {
            _error = '$_error\n\n$backendStatusHint';
          } else {
            _error = '$_error\n\nBackend may be down. Please check Firebase Functions or try again later.';
          }
          _isLoading = false;
        });
        
        // Refresh diagnostics to show current backend status
        _checkBackendDiagnostics();
        
        if (kDebugMode) {
          debugPrint('[WhatsAppAccountsScreen] _loadAccounts: setState called - _isLoading=false, _error=$_error');
        }
      } else {
        if (kDebugMode) {
          debugPrint('[WhatsAppAccountsScreen] _loadAccounts: widget not mounted, cannot setState');
        }
      }
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

    if (result != true) return;

    // Guard: prevent double-tap
    if (_isAddingAccount) return;
    setState(() => _isAddingAccount = true);

    try {
      final response = await _apiService.addAccount(
        name: nameController.text.trim(),
        phone: phoneController.text.trim(),
      );

      if (mounted) {
        if (response['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Account added successfully'),
              backgroundColor: Colors.green,
            ),
          );
          await _loadAccounts();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(response['message'] ?? 'Failed to add account'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
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
        setState(() => _isAddingAccount = false);
      }
    }
  }

  Future<void> _regenerateQr(String accountId) async {
    // Guard: prevent double-tap
    if (_regeneratingQr.contains(accountId)) return;
    
    setState(() => _regeneratingQr.add(accountId));

    try {
      final response = await _apiService.regenerateQr(accountId: accountId);

      if (mounted) {
        if (response['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('QR regeneration started'),
              backgroundColor: Colors.green,
            ),
          );
          // Reload accounts to get new QR code
          await Future.delayed(const Duration(seconds: 2));
          await _loadAccounts();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(response['message'] ?? 'Failed to regenerate QR'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        // CRITICAL FIX: Handle 429 (rate limited) gracefully - show friendly message with retry time
        if (e is NetworkException && e.code == 'rate_limited') {
          final retryAfterSeconds = (e.originalError as Map<String, dynamic>?)?['retryAfterSeconds'] as int? ?? 10;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${e.message}\nPlease wait ${retryAfterSeconds}s before regenerating QR again'),
              backgroundColor: Colors.orange,
              duration: Duration(seconds: retryAfterSeconds),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Error: ${e.toString()}'),
              backgroundColor: Colors.red,
            ),
          );
        }
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

  /// Open WhatsApp Web in Firefox with a container
  /// Uses the firefox-container script to open WhatsApp Web in a named container
  Future<void> _openInFirefoxContainer(
    String accountId,
    String accountName,
  ) async {
    // Guard: prevent double-tap
    if (_openingFirefox.contains(accountId)) return;
    
    setState(() => _openingFirefox.add(accountId));

    // Get script path (from env var or default) - defined outside try for catch block access
    final scriptPath = _getFirefoxContainerScriptPath();

    try {
      
      if (kDebugMode) {
        debugPrint('[WhatsAppAccountsScreen] Firefox script path: $scriptPath');
      }
      
      // Check if script exists
      final scriptFile = File(scriptPath);
      if (!await scriptFile.exists()) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Firefox container script not found at:\n$scriptPath\n\n'
                'Please:\n'
                '1. Install the script at: scripts/wa_web_launcher/firefox-container\n'
                '2. Or set WA_WEB_LAUNCHER_PATH environment variable\n'
                '3. Make the script executable: chmod +x <script-path>',
              ),
              backgroundColor: Colors.red,
              duration: const Duration(seconds: 5),
            ),
          );
        }
        return;
      }

      // Check if script is executable
      final stat = await scriptFile.stat();
      if (stat.mode & 0x111 == 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Script is not executable. Run: chmod +x $scriptPath',
              ),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      // Get signing key from process environment only
      // Set via VSCode launch.json env, Terminal export, or IDE run configuration
      final signingKey = Platform.environment['OPEN_URL_IN_CONTAINER_SIGNING_KEY'];
      
      if (kDebugMode) {
        if (signingKey != null && signingKey.isNotEmpty) {
          debugPrint('[WhatsAppAccountsScreen] Signing key present (${signingKey.length} chars)');
        } else {
          debugPrint('[WhatsAppAccountsScreen] Signing key not set - Firefox may show confirmation dialogs');
        }
      }
      
      // Signing key is optional - show warning but don't block execution
      if (signingKey == null || signingKey.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Warning: OPEN_URL_IN_CONTAINER_SIGNING_KEY not set.\n'
                'Firefox will show confirmation dialogs. Set it in VSCode launch.json or export in terminal.',
              ),
              backgroundColor: Colors.orange,
              duration: Duration(seconds: 4),
            ),
          );
        }
      }

      // Generate container name from account name (sanitize for container names)
      final containerName = accountName
          .replaceAll(' ', '-')
          .replaceAll(RegExp(r'[^a-zA-Z0-9\-]'), '')
          .toLowerCase();
      
      // Use account name to determine color (cycling through colors)
      final colors = ['blue', 'orange', 'green', 'red', 'purple', 'pink', 'yellow', 'turquoise'];
      final colorIndex = accountName.hashCode.abs() % colors.length;
      final color = colors[colorIndex];
      
      // Use account name to determine icon (cycling through icons)
      final icons = ['circle', 'fruit', 'square', 'triangle'];
      final iconIndex = accountName.hashCode.abs() % icons.length;
      final icon = icons[iconIndex];

      // Build command arguments
      final args = [
        '--name', containerName,
        '--color', color,
        '--icon', icon,
        _waUrl,
      ];

      // Execute script with environment
      final env = Map<String, String>.from(Platform.environment);
      if (signingKey != null && signingKey.isNotEmpty) {
        env['OPEN_URL_IN_CONTAINER_SIGNING_KEY'] = signingKey;
      }
      
      if (kDebugMode) {
        debugPrint('[WhatsAppAccountsScreen] Executing: $scriptPath ${args.join(" ")}');
        debugPrint('[WhatsAppAccountsScreen] Container: $containerName, Color: $color, Icon: $icon');
      }
      
      final result = await Process.run(
        scriptPath,
        args,
        environment: env,
        runInShell: false,
      );
      
      if (kDebugMode) {
        debugPrint('[WhatsAppAccountsScreen] Script exit code: ${result.exitCode}');
        if (result.stdout.toString().isNotEmpty) {
          debugPrint('[WhatsAppAccountsScreen] Script stdout: ${result.stdout}');
        }
        if (result.stderr.toString().isNotEmpty) {
          debugPrint('[WhatsAppAccountsScreen] Script stderr: ${result.stderr}');
        }
      }

      if (mounted) {
        if (result.exitCode == 0) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Opening WhatsApp Web in Firefox container: $containerName\n'
                'Please scan the QR code with your WhatsApp app.',
              ),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 3),
            ),
          );
        } else {
          final errorMsg = result.stderr.toString().trim();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Failed to open Firefox:\n${errorMsg.isNotEmpty ? errorMsg : result.stdout.toString()}',
              ),
              backgroundColor: Colors.red,
              duration: const Duration(seconds: 5),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Error opening Firefox: ${e.toString()}\n\n'
              'Make sure:\n'
              '1. Firefox is installed\n'
              '2. Script exists at: $scriptPath\n'
              '3. Script is executable (chmod +x)\n'
              '4. OPEN_URL_IN_CONTAINER_SIGNING_KEY is set (optional)',
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _openingFirefox.remove(accountId));
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

    final statusColor = _getStatusColor(status);
    final showQr = status == 'qr_ready' && qrCode != null;
    // When showQr is true, qrCode is guaranteed non-null
    final qrCodeData = qrCode ?? '';

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
                    status.toUpperCase(),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: statusColor,
                    ),
                  ),
                ),
              ],
            ),
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
                else if (Platform.isMacOS && status != 'connected')
                  TextButton.icon(
                    onPressed: _openingFirefox.contains(id) || _isAddingAccount
                        ? null
                        : () => _openInFirefoxContainer(id, name),
                    icon: _openingFirefox.contains(id)
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.open_in_browser, size: 18),
                    label: Text(_openingFirefox.contains(id) ? 'Opening...' : 'Open in Firefox'),
                  )
                else if (Platform.isMacOS && status == 'connected')
                  Tooltip(
                    message: 'Open WhatsApp Web in Firefox container',
                    child: TextButton.icon(
                      onPressed: _openingFirefox.contains(id) || _isAddingAccount
                          ? null
                          : () => _openInFirefoxContainer(id, name),
                      icon: const Icon(Icons.open_in_browser, size: 18),
                      label: const Text('Open in Firefox'),
                    ),
                  )
                else
                  const SizedBox.shrink(),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextButton.icon(
                      onPressed: _regeneratingQr.contains(id) || _isAddingAccount
                          ? null
                          : () => _regenerateQr(id),
                      icon: const Icon(Icons.refresh, size: 18),
                      label: const Text('Regenerate QR'),
                    ),
                    const SizedBox(width: 8),
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
      case 'connecting':
        return Colors.blue;
      case 'disconnected':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  /// Build diagnostics banner showing backend mode (active/passive)
  Widget _buildDiagnosticsBanner() {
    if (_backendDiagnostics == null) return const SizedBox.shrink();
    
    final diagnostics = _backendDiagnostics!;
    final isPassive = diagnostics.isPassive;
    final isActive = diagnostics.isActive;
    
    Color bannerColor;
    IconData bannerIcon;
    String bannerTitle;
    String bannerMessage;
    
    if (isPassive) {
      bannerColor = Colors.orange;
      bannerIcon = Icons.warning_amber_rounded;
      bannerTitle = 'Backend in PASSIVE Mode';
      bannerMessage = 'Another Railway instance holds the lock. '
          '${diagnostics.reason != null ? "Reason: ${diagnostics.reason}" : "Backend will retry automatically."}\n'
          'Accounts can still be viewed, but AI features are disabled.';
    } else if (isActive) {
      bannerColor = Colors.green;
      bannerIcon = Icons.check_circle;
      bannerTitle = 'Backend ACTIVE';
      bannerMessage = 'Backend is ready. AI features and account management are available.';
    } else {
      bannerColor = Colors.grey;
      bannerIcon = Icons.help_outline;
      bannerTitle = 'Backend Status Unknown';
      bannerMessage = diagnostics.error ?? 'Could not determine backend status.';
    }
    
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bannerColor.withOpacity(0.1),
        border: Border(
          bottom: BorderSide(color: bannerColor.withOpacity(0.3), width: 1),
        ),
      ),
      child: Row(
        children: [
          Icon(bannerIcon, color: bannerColor, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  bannerTitle,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: bannerColor,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  bannerMessage,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[700],
                  ),
                ),
              ],
            ),
          ),
          if (isPassive)
            TextButton(
              onPressed: _checkBackendDiagnostics,
              child: const Text('Refresh'),
            ),
        ],
      ),
    );
  }
  
  /// Build loading view
  Widget _buildLoadingView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          const Text('Loading WhatsApp accounts...'),
          const SizedBox(height: 8),
          Text(
            'This may take a few seconds',
            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }
  
  /// Build error view
  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red[300],
            ),
            const SizedBox(height: 16),
            Text(
              _error!,
              style: const TextStyle(fontSize: 16),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                _loadAccounts();
                _checkBackendDiagnostics();
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
  
  /// Build accounts view with two sections: Backend accounts (AI) and Firefox sessions (manual)
  Widget _buildAccountsView() {
    return RefreshIndicator(
      onRefresh: () async {
        await _loadAccounts();
        await _checkBackendDiagnostics();
      },
      child: CustomScrollView(
        slivers: [
          // Section: Backend Accounts (AI)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.smart_toy, size: 24),
                      const SizedBox(width: 8),
                      const Text(
                        'Backend Accounts (AI)',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'These accounts are managed by the Railway backend (Baileys). '
                    'They enable AI features and operator inbox.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey,
                    ),
                  ),
                  if (_accounts.isEmpty) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Center(
                        child: Text(
                          'No backend accounts found.\nAdd an account to enable AI features.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          
          // Backend accounts list
          if (_accounts.isNotEmpty)
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) => _buildAccountCard(_accounts[index]),
                childCount: _accounts.length,
              ),
            ),
          
          // Section separator
          const SliverToBoxAdapter(
            child: Divider(height: 32),
          ),
          
          // Section: Firefox Sessions (Manual)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.open_in_browser, size: 24),
                      const SizedBox(width: 8),
                      const Text(
                        'Firefox Sessions (Manual)',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.orange.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.orange.withOpacity(0.3)),
                    ),
                    child: const Text(
                      'Firefox WhatsApp Web sessions are separate from backend accounts.\n'
                      'They do NOT appear here automatically. Use Firefox containers manually via terminal scripts.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.orange,
                      ),
                    ),
                  ),
                  if (Platform.isMacOS) ...[
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => _openInFirefoxContainer('test', 'Test Container'),
                      icon: const Icon(Icons.open_in_browser),
                      label: const Text('Test Firefox Container'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'This opens WhatsApp Web in a Firefox container for manual scanning.',
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                  ],
                  if (!Platform.isMacOS) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey[200],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        '⚠ Firefox integration is available only on macOS.',
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Debug: Force check loading state
    if (kDebugMode && _isLoading) {
      debugPrint('[WhatsAppAccountsScreen] build: _isLoading=true, _error=$_error, _accounts.length=${_accounts.length}');
    }
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp Accounts'),
        backgroundColor: const Color(0xFF25D366),
        actions: [
          if (!_isLoading && _error == null)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () {
                _loadAccounts();
                _checkBackendDiagnostics();
              },
              tooltip: 'Refresh',
            ),
        ],
      ),
      body: Column(
        children: [
          // Backend diagnostics banner
          if (_backendDiagnostics != null) _buildDiagnosticsBanner(),
          
          // Main content (loading/error/accounts)
          Expanded(
            child: _isLoading
                ? _buildLoadingView()
                : _error != null
                    ? _buildErrorView()
                    : _buildAccountsView(),
          ),
        ],
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
