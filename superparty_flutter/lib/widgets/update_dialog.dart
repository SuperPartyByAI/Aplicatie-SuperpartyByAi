import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/auto_update_service.dart';

/// Dialog pentru notificare update disponibil
class UpdateDialog extends StatelessWidget {
  final String message;
  final String? downloadUrl;
  final bool forceUpdate;
  final VoidCallback? onDismiss;

  const UpdateDialog({
    Key? key,
    required this.message,
    this.downloadUrl,
    this.forceUpdate = false,
    this.onDismiss,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      // Previne închiderea dialog-ului dacă e force update
      onWillPop: () async => !forceUpdate,
      child: AlertDialog(
        title: Row(
          children: [
            Icon(
              Icons.system_update,
              color: Theme.of(context).primaryColor,
            ),
            const SizedBox(width: 8),
            const Text('Actualizare Disponibilă'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message),
            if (forceUpdate) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Row(
                  children: [
                    Icon(Icons.warning, color: Colors.orange.shade700, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Această actualizare este obligatorie.',
                        style: TextStyle(
                          color: Colors.orange.shade900,
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
        actions: [
          if (!forceUpdate)
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                onDismiss?.call();
              },
              child: const Text('Mai Târziu'),
            ),
          ElevatedButton(
            onPressed: () async {
              if (downloadUrl != null) {
                // Deschide URL-ul de download
                final uri = Uri.parse(downloadUrl!);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              }
              
              if (forceUpdate) {
                // Deconectează userul
                await AutoUpdateService.forceLogout();
                
                // Închide aplicația (sau navighează la login)
                if (context.mounted) {
                  Navigator.of(context).pushNamedAndRemoveUntil(
                    '/login',
                    (route) => false,
                  );
                }
              } else {
                Navigator.of(context).pop();
                onDismiss?.call();
              }
            },
            child: const Text('Actualizează Acum'),
          ),
        ],
      ),
    );
  }

  /// Afișează dialog-ul de update
  static Future<void> show(
    BuildContext context, {
    String? message,
    String? downloadUrl,
    bool forceUpdate = false,
    VoidCallback? onDismiss,
  }) async {
    // Obține mesajul din Firestore dacă nu e furnizat
    final updateMessage = message ?? await AutoUpdateService.getUpdateMessage();
    
    // Obține URL-ul de download dacă nu e furnizat
    final url = downloadUrl ?? await AutoUpdateService.getDownloadUrl();
    
    if (!context.mounted) return;
    
    await showDialog(
      context: context,
      barrierDismissible: !forceUpdate,
      builder: (context) => UpdateDialog(
        message: updateMessage,
        downloadUrl: url,
        forceUpdate: forceUpdate,
        onDismiss: onDismiss,
      ),
    );
  }
}
