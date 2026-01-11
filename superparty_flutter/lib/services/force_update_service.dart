import 'package:flutter/material.dart';
import 'package:in_app_update/in_app_update.dart';
import 'dart:io';

/// Force update service - blocks app until user updates
class ForceUpdateService {
  static Future<void> checkForUpdate(BuildContext context) async {
    // Only for Android (iOS uses App Store review process)
    if (!Platform.isAndroid) return;

    try {
      final updateInfo = await InAppUpdate.checkForUpdate();

      if (updateInfo.updateAvailability == UpdateAvailability.updateAvailable) {
        // Show force update dialog
        if (context.mounted) {
          _showForceUpdateDialog(context);
        }
      }
    } catch (e) {
      debugPrint('Force update check error: $e');
      // Don't block app if update check fails
    }
  }

  static void _showForceUpdateDialog(BuildContext context) {
    showDialog(
      context: context,
      barrierDismissible: false, // Cannot dismiss
      builder: (context) => WillPopScope(
        onWillPop: () async => false, // Cannot go back
        child: AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.system_update, color: Colors.orange, size: 32),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Actualizare Obligatorie',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: const Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'O versiune nouă este disponibilă!',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 12),
              Text(
                'Trebuie să actualizezi aplicația pentru a continua.',
                style: TextStyle(fontSize: 14),
              ),
              SizedBox(height: 16),
              Text(
                '✨ Noutăți:',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 8),
              Text(
                '• AI Chat îmbunătățit\n'
                '• Răspunsuri mai rapide\n'
                '• Funcții noi în GM mode\n'
                '• Bug fixes și îmbunătățiri',
                style: TextStyle(fontSize: 13, height: 1.5),
              ),
            ],
          ),
          actions: [
            ElevatedButton.icon(
              onPressed: () async {
                try {
                  await InAppUpdate.performImmediateUpdate();
                  // App will restart after update
                } catch (e) {
                  debugPrint('Update error: $e');
                  // Retry or open Play Store
                  await InAppUpdate.startFlexibleUpdate();
                }
              },
              icon: const Icon(Icons.download),
              label: const Text('Actualizează Acum'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
