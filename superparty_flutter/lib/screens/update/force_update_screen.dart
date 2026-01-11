import 'dart:io';
import 'package:flutter/material.dart';
import '../../services/force_update_checker_service.dart';
import '../../services/apk_downloader_service.dart';
import '../../services/apk_installer_bridge.dart';

/// ForceUpdateScreen: Full-screen non-dismissible update UI
/// 
/// Features:
/// - Non-dismissible (back button disabled)
/// - Download APK with progress bar
/// - Install via native Android code
/// - Fallback to Settings if permission needed
/// - User stays authenticated (NO signOut)
class ForceUpdateScreen extends StatefulWidget {
  final VoidCallback? onUpdateComplete;

  const ForceUpdateScreen({
    super.key,
    this.onUpdateComplete,
  });

  @override
  State<ForceUpdateScreen> createState() => _ForceUpdateScreenState();
}

enum _UpdateState {
  idle,
  downloading,
  installing,
  error,
  permissionRequired,
}

class _ForceUpdateScreenState extends State<ForceUpdateScreen> {
  _UpdateState _state = _UpdateState.idle;
  double _progress = 0.0;
  String _errorMessage = '';
  String? _downloadedFilePath;
  
  String _updateMessage = '';
  String _releaseNotes = '';
  String _downloadUrl = '';

  @override
  void initState() {
    super.initState();
    _loadUpdateInfo();
  }

  Future<void> _loadUpdateInfo() async {
    try {
      final checker = ForceUpdateCheckerService();
      
      final message = await checker.getUpdateMessage();
      final notes = await checker.getReleaseNotes();
      final url = await checker.getDownloadUrl();
      
      if (mounted) {
        setState(() {
          _updateMessage = message;
          _releaseNotes = notes;
          _downloadUrl = url ?? '';
        });
      }
    } catch (e) {
      debugPrint('[ForceUpdateScreen] Error loading update info: $e');
    }
  }

  Future<void> _downloadAndInstall() async {
    if (!Platform.isAndroid) {
      _showError('Instalarea automată este disponibilă doar pe Android');
      return;
    }

    if (_downloadUrl.isEmpty) {
      _showError('URL de download lipsește. Contactează administratorul.');
      return;
    }

    setState(() {
      _state = _UpdateState.downloading;
      _progress = 0.0;
      _errorMessage = '';
    });

    try {
      // 1. Download APK cu progress
      debugPrint('[ForceUpdateScreen] Starting download...');
      final filePath = await ApkDownloaderService.downloadApk(
        _downloadUrl,
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

      debugPrint('[ForceUpdateScreen] Download complete: $filePath');
      _downloadedFilePath = filePath;

      setState(() {
        _state = _UpdateState.installing;
        _progress = 1.0;
      });

      // 2. Verifică permisiunea de instalare
      final canInstall = await ApkInstallerBridge.canInstallPackages();
      
      if (!canInstall) {
        debugPrint('[ForceUpdateScreen] Install permission required');
        setState(() {
          _state = _UpdateState.permissionRequired;
        });
        return;
      }

      // 3. Instalează APK
      await _installApk(filePath);

    } catch (e) {
      debugPrint('[ForceUpdateScreen] Error: $e');
      _showError(e.toString());
    }
  }

  Future<void> _installApk(String filePath) async {
    try {
      debugPrint('[ForceUpdateScreen] Installing APK...');
      final success = await ApkInstallerBridge.installApk(filePath);

      if (!success) {
        throw Exception('Instalarea a eșuat - încearcă din nou');
      }

      // Installerul Android s-a deschis
      // User-ul va instala manual și va redeschide app-ul
      // La redeschidere, UpdateGate va vedea că build-ul e OK și va lăsa user-ul să intre
      debugPrint('[ForceUpdateScreen] Installer opened successfully');

    } catch (e) {
      debugPrint('[ForceUpdateScreen] Install error: $e');
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
      debugPrint('[ForceUpdateScreen] Error opening settings: $e');
      _showError('Nu s-au putut deschide setările');
    }
  }

  void _showError(String message) {
    setState(() {
      _state = _UpdateState.error;
      _errorMessage = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async => false, // Disable back button
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Icon
                Icon(
                  Icons.system_update,
                  size: 80,
                  color: Theme.of(context).primaryColor,
                ),
                const SizedBox(height: 32),
                
                // Title
                const Text(
                  'Actualizare Obligatorie',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                
                // Message
                Text(
                  _updateMessage.isNotEmpty 
                      ? _updateMessage 
                      : 'O versiune nouă este disponibilă. Actualizează pentru a continua.',
                  style: const TextStyle(fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                
                // Release notes
                if (_releaseNotes.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.blue.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Ce e nou:',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _releaseNotes,
                          style: const TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                ],
                
                const SizedBox(height: 32),
                
                // Progress indicator
                if (_state == _UpdateState.downloading) ...[
                  LinearProgressIndicator(
                    value: _progress,
                    backgroundColor: Colors.grey.shade200,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      Theme.of(context).primaryColor,
                    ),
                    minHeight: 8,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Descărcare: ${(_progress * 100).toStringAsFixed(0)}%',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                
                // Installing status
                if (_state == _UpdateState.installing) ...[
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text(
                    'Deschidere installer...',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                
                // Permission required
                if (_state == _UpdateState.permissionRequired) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.orange.shade200),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Icon(Icons.warning, color: Colors.orange.shade700, size: 24),
                            const SizedBox(width: 12),
                            const Expanded(
                              child: Text(
                                'Permisiune necesară',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Pentru a instala actualizarea, trebuie să permiți instalarea din surse necunoscute.',
                          style: TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                ],
                
                // Error message
                if (_state == _UpdateState.error) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.error, color: Colors.red.shade700, size: 24),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _errorMessage,
                            style: TextStyle(
                              color: Colors.red.shade900,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                
                const SizedBox(height: 32),
                
                // Action button
                SizedBox(
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _getButtonAction(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Theme.of(context).primaryColor,
                      disabledBackgroundColor: Colors.grey.shade300,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      _getButtonText(),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // Info text
                Text(
                  'Vei rămâne autentificat după actualizare',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
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
