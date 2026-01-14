import 'package:flutter/material.dart';

/// Screen shown when a critical error occurs
class ErrorScreen extends StatelessWidget {
  final String error;
  final String? stackTrace;

  const ErrorScreen({
    super.key,
    required this.error,
    this.stackTrace,
  });

  @override
  Widget build(BuildContext context) {
    // CRITICAL: Do NOT create MaterialApp here (single MaterialApp rule)
    // This widget must be used within the existing MaterialApp context
    return Scaffold(
      appBar: AppBar(
        title: const Text('Eroare'),
        backgroundColor: Colors.red,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error,
                size: 80,
                color: Colors.red,
              ),
              const SizedBox(height: 24),
              const Text(
                'A apărut o eroare',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                error,
                style: const TextStyle(fontSize: 16),
                textAlign: TextAlign.center,
              ),
              if (stackTrace != null) ...[
                const SizedBox(height: 24),
                ExpansionTile(
                  title: const Text('Detalii tehnice'),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      color: Colors.grey[200],
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Text(
                          stackTrace!,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 32),
              ElevatedButton.icon(
                onPressed: () {
                  // Try to restart app
                  // In production, this would trigger app restart
                },
                icon: const Icon(Icons.refresh),
                label: const Text('Reîncearcă'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 16,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
