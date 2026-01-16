import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import '../services/firebase_service.dart';

/// Banner widget shown when Firebase emulators are unavailable
class EmulatorUnavailableBanner extends StatelessWidget {
  final VoidCallback? onRetry;

  const EmulatorUnavailableBanner({super.key, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: Colors.orange.shade100,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning, color: Colors.orange.shade800),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Emulators unavailable',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.orange.shade900,
                    fontSize: 16,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Firebase emulators are not available. Some features may not work.',
            style: TextStyle(color: Colors.orange.shade800),
          ),
          const SizedBox(height: 8),
          ElevatedButton.icon(
            onPressed: () {
              if (onRetry != null) {
                onRetry!();
              } else {
                // Default retry
                _retryFirebase();
              }
            },
            icon: const Icon(Icons.refresh),
            label: const Text('Retry Connection'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange.shade700,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  void _retryFirebase() {
    debugPrint('[EmulatorUnavailableBanner] Retrying Firebase connection...');
    FirebaseService.initialize().then((_) {
      debugPrint('[EmulatorUnavailableBanner] ✅ Retry successful');
    }).catchError((e) {
      debugPrint('[EmulatorUnavailableBanner] ❌ Retry failed: $e');
    });
  }
}
