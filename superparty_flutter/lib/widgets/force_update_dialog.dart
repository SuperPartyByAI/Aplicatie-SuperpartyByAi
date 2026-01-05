import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;
import '../services/update_checker_service.dart';

class ForceUpdateDialog extends StatefulWidget {
  final AppVersionInfo versionInfo;

  const ForceUpdateDialog({
    super.key,
    required this.versionInfo,
  });

  @override
  State<ForceUpdateDialog> createState() => _ForceUpdateDialogState();
}

class _ForceUpdateDialogState extends State<ForceUpdateDialog> {
  bool _downloading = false;
  double _progress = 0.0;
  String _status = '';

  static const platform = MethodChannel('com.superparty.app/install');

  Future<void> _downloadAndInstall() async {
    setState(() {
      _downloading = true;
      _status = 'Descărcare...';
      _progress = 0.0;
    });

    try {
      final apkUrl = widget.versionInfo.apkUrl;
      
      // Download APK
      final response = await http.get(Uri.parse(apkUrl));
      
      if (response.statusCode != 200) {
        throw Exception('Eroare la descărcare: ${response.statusCode}');
      }

      setState(() {
        _progress = 0.5;
        _status = 'Salvare fișier...';
      });

      // Save to app's external files directory
      final dir = await getExternalStorageDirectory();
      final apkPath = '${dir!.path}/superparty-update.apk';
      final file = File(apkPath);
      await file.writeAsBytes(response.bodyBytes);

      setState(() {
        _progress = 0.8;
        _status = 'Deschidere instalare...';
      });

      // Install APK using platform channel
      try {
        await platform.invokeMethod('installApk', {'path': apkPath});
        
        setState(() {
          _progress = 1.0;
          _status = 'Instalează APK-ul pentru a continua';
        });
      } catch (e) {
        // Fallback: try to open file directly
        final uri = Uri.parse('content://com.superparty.app.fileprovider$apkPath');
        final intent = {
          'action': 'android.intent.action.VIEW',
          'data': apkPath,
          'type': 'application/vnd.android.package-archive',
        };
        
        setState(() {
          _progress = 1.0;
          _status = 'Deschide fișierul APK manual din Downloads';
        });
      }
    } catch (e) {
      setState(() {
        _downloading = false;
        _status = 'Eroare: ${e.toString()}';
      });
      
      // Show error and allow retry
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare la descărcare: ${e.toString()}'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false, // Prevent back button
      child: AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.system_update, color: Color(0xFF20C997), size: 32),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Actualizare Obligatorie',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.versionInfo.updateMessage,
              style: const TextStyle(fontSize: 16),
            ),
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
                  Text(
                    'Versiune nouă: ${widget.versionInfo.latestVersion}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  if (widget.versionInfo.releaseNotes.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Ce e nou:',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.versionInfo.releaseNotes,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
            if (_downloading) ...[
              const SizedBox(height: 16),
              LinearProgressIndicator(
                value: _progress,
                backgroundColor: Colors.grey.shade200,
                valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF20C997)),
              ),
              const SizedBox(height: 8),
              Text(
                _status,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade700,
                ),
              ),
            ],
          ],
        ),
        actions: [
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _downloading ? null : _downloadAndInstall,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF20C997),
                disabledBackgroundColor: Colors.grey.shade300,
              ),
              child: _downloading
                  ? const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(width: 12),
                        Text(
                          'Descărcare...',
                          style: TextStyle(fontSize: 16, color: Colors.white),
                        ),
                      ],
                    )
                  : const Text(
                      'Actualizează Acum',
                      style: TextStyle(fontSize: 16, color: Colors.white),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
