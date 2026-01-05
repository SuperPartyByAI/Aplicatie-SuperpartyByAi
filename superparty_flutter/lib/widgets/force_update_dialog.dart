import 'dart:io';
import 'package:flutter/material.dart';
import '../services/force_update_checker_service.dart';
import '../services/apk_downloader_service.dart';
import '../services/apk_installer_bridge.dart';

/// Dialog obligatoriu pentru force update
/// 
/// Features:
/// - Non-dismissible (WillPopScope + barrierDismissible=false)
/// - Download APK cu progress bar
/// - Instalare prin native Android code
/// - Fallback la Settings dacă "Install unknown apps" e disabled
class ForceUpdateDialog extends StatefulWidget {
  final String message;
  final String releaseNotes;
  final String downloadUrl;

  const ForceUpdateDialog({
    super.key,
    required this.message,
    required this.releaseNotes,
    required this.downloadUrl,
  });

  @override
  State<ForceUpdateDialog> createState() => _ForceUpdateDialogState();

  /// Afișează dialog-ul de force update
  /// 
  /// Citește config din Firestore și afișează dialog non-dismissible
  static Future<void> show(BuildContext context) async {
    final checker = ForceUpdateCheckerService();
    
    final message = await checker.getUpdateMessage();
    final releaseNotes = await checker.getReleaseNotes();
    final downloadUrl = await checker.getDownloadUrl();

    if (downloadUrl == null) {
      print('[ForceUpdateDialog] No download URL available');
      return;
    }

    if (!context.mounted) return;

    await showDialog(
      context: context,
      barrierDismissible: false, // Nu poate fi închis prin tap outside
      builder: (context) => ForceUpdateDialog(
        message: message,
        releaseNotes: releaseNotes,
        downloadUrl: downloadUrl,
      ),
    );
  }
}

enum _UpdateState {
  idle,
  downloading,
  installing,
  error,
  permissionRequired,
}

class _ForceUpdateDialogState extends State<ForceUpdateDialog> {
  _UpdateState _state = _UpdateState.idle;
  double _progress = 0.0;
  String _errorMessage = '';
  String? _downloadedFilePath;

  Future<void> _downloadAndInstall() async {
    if (!Platform.isAndroid) {
      _showError('Instalarea automată este disponibilă doar pe Android');
      return;
    }

    setState(() {
      _state = _UpdateState.downloading;
      _progress = 0.0;
      _errorMessage = '';
    });

    try {
      // 1. Download APK cu progress
      print('[ForceUpdateDialog] Starting download...');
      final filePath = await ApkDownloaderService.downloadApk(
        widget.downloadUrl,
        onProgress: (progress) {
          if (mounted) {
            setState(() {
              _progress = progress;
            });
          }
        },
      );

      if (filePath == null) {
        throw Exception('Download eșuat - verifică conexiunea la internet');
      }

      print('[ForceUpdateDialog] Download complete: $filePath');
      _downloadedFilePath = filePath;

      setState(() {
        _state = _UpdateState.installing;
        _progress = 1.0;
      });

      // 2. Verifică permisiunea de instalare
      final canInstall = await ApkInstallerBridge.canInstallPackages();
      
      if (!canInstall) {
        print('[ForceUpdateDialog] Install permission required');
        setState(() {
          _state = _UpdateState.permissionRequired;
        });
        return;
      }

      // 3. Instalează APK
      await _installApk(filePath);

    } catch (e) {
      print('[ForceUpdateDialog] Error: $e');
      _showError(e.toString());
    }
  }

  Future<void> _installApk(String filePath) async {
    try {
      print('[ForceUpdateDialog] Installing APK...');
      final success = await ApkInstallerBridge.installApk(filePath);

      if (!success) {
        throw Exception('Instalarea a eșuat - încearcă din nou');
      }

      // Installerul Android s-a deschis
      // User-ul va instala manual și va redeschide app-ul
      print('[ForceUpdateDialog] Installer opened successfully');

    } catch (e) {
      print('[ForceUpdateDialog] Install error: $e');
      _showError(e.toString());
    }
  }

  Future<void> _openUnknownSourcesSettings() async {
    try {
      await ApkInstallerBridge.openUnknownSourcesSettings();
      
      // Așteaptă 2 secunde și verifică din nou permisiunea
      await Future.delayed(const Duration(seconds: 2));
      
      final canInstall = await ApkInstallerBridge.canInstallPackages();
      
      if (canInstall && _downloadedFilePath != null) {
        // Permisiunea a fost acordată, reluăm instalarea
        await _installApk(_downloadedFilePath!);
      } else {
        // User-ul trebuie să revină și să apese din nou butonul
        setState(() {
          _state = _UpdateState.permissionRequired;
        });
      }
    } catch (e) {
      print('[ForceUpdateDialog] Error opening settings: $e');
      _showError('Nu s-au putut deschide setările');
    }
  }

  void _showError(String message) {
    setState(() {
      _state = _UpdateState.error;
      _errorMessage = message;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 5),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async => false, // Blochează back button
      child: AlertDialog(
        title: Row(
          children: [
            Icon(
              Icons.system_update,
              color: Theme.of(context).primaryColor,
              size: 32,
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Actualizare Obligatorie',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Mesaj principal
              Text(
                widget.message,
                style: const TextStyle(fontSize: 16),
              ),
              
              // Release notes
              if (widget.releaseNotes.isNotEmpty) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Ce e nou:',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        widget.releaseNotes,
                        style: const TextStyle(fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
              
              // Progress bar (download)
              if (_state == _UpdateState.downloading) ...[
                const SizedBox(height: 16),
                LinearProgressIndicator(
                  value: _progress,
                  backgroundColor: Colors.grey.shade200,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    Theme.of(context).primaryColor,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Descărcare: ${(_progress * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade700,
                  ),
                ),
              ],
              
              // Installing status
              if (_state == _UpdateState.installing) ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Deschidere installer...',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              
              // Permission required
              if (_state == _UpdateState.permissionRequired) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.orange.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.warning, color: Colors.orange.shade700, size: 20),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'Permisiune necesară',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Pentru a instala actualizarea, trebuie să permiți instalarea din surse necunoscute.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
              
              // Error message
              if (_state == _UpdateState.error) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error, color: Colors.red.shade700, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage,
                          style: TextStyle(
                            color: Colors.red.shade900,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        actions: [
          // Buton principal
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _getButtonAction(),
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).primaryColor,
                disabledBackgroundColor: Colors.grey.shade300,
              ),
              child: Text(
                _getButtonText(),
                style: const TextStyle(fontSize: 16, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }

  VoidCallback? _getButtonAction() {
    switch (_state) {
      case _UpdateState.idle:
      case _UpdateState.error:
        return _downloadAndInstall;
      case _UpdateState.permissionRequired:
        return _openUnknownSourcesSettings;
      case _UpdateState.downloading:
      case _UpdateState.installing:
        return null; // Disabled
    }
  }

  String _getButtonText() {
    switch (_state) {
      case _UpdateState.idle:
        return 'Actualizează Acum';
      case _UpdateState.downloading:
        return 'Descărcare...';
      case _UpdateState.installing:
        return 'Instalare...';
      case _UpdateState.permissionRequired:
        return 'Deschide Setări';
      case _UpdateState.error:
        return 'Încearcă Din Nou';
    }
  }
}
