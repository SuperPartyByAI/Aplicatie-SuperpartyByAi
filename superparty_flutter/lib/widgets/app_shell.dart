import 'package:flutter/material.dart';

/// AppShell - Ensures app always shows UI (Loading/Error/Success)
/// Never blocks runApp() - shows immediate feedback to user
class AppShell extends StatefulWidget {
  final Future<void> Function() initFunction;
  final Widget child;
  final Duration timeout;
  final int maxRetries;

  const AppShell({
    super.key,
    required this.initFunction,
    required this.child,
    this.timeout = const Duration(seconds: 10),
    this.maxRetries = 3,
  });

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  AppShellState _state = AppShellState.loading;
  String? _errorMessage;
  int _retryCount = 0;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    setState(() {
      _state = AppShellState.loading;
      _errorMessage = null;
    });

    debugPrint('[BOOT] AppShell: Starting initialization (attempt ${_retryCount + 1}/${widget.maxRetries})');

    try {
      await widget.initFunction().timeout(
        widget.timeout,
        onTimeout: () {
          throw TimeoutException('Initialization timeout after ${widget.timeout.inSeconds}s');
        },
      );

      debugPrint('[BOOT] AppShell: ✅ Initialization successful');
      
      if (mounted) {
        setState(() {
          _state = AppShellState.success;
          _retryCount = 0;
        });
      }
    } catch (e, stackTrace) {
      debugPrint('[BOOT] AppShell: ❌ Initialization failed: $e');
      debugPrint('[BOOT] AppShell: Stack trace: $stackTrace');

      if (mounted) {
        setState(() {
          _state = AppShellState.error;
          _errorMessage = e.toString();
        });
      }
    }
  }

  void _retry() {
    if (_retryCount < widget.maxRetries) {
      _retryCount++;
      _initialize();
    } else {
      debugPrint('[BOOT] AppShell: ⚠️ Max retries (${widget.maxRetries}) reached');
      setState(() {
        _errorMessage = 'Max retries reached. Please check your connection and restart the app.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    switch (_state) {
      case AppShellState.loading:
        return _buildLoadingScreen();
      
      case AppShellState.error:
        return _buildErrorScreen();
      
      case AppShellState.success:
        return widget.child;
    }
  }

  Widget _buildLoadingScreen() {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 24),
              Text(
                'Initializing...',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                'Attempt ${_retryCount + 1}/${widget.maxRetries}',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildErrorScreen() {
    final canRetry = _retryCount < widget.maxRetries;

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 80,
                  color: Colors.red,
                ),
                const SizedBox(height: 24),
                const Text(
                  'Initialization Failed',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  _errorMessage ?? 'Unknown error',
                  style: const TextStyle(fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                if (canRetry)
                  ElevatedButton.icon(
                    onPressed: _retry,
                    icon: const Icon(Icons.refresh),
                    label: Text('Retry (${widget.maxRetries - _retryCount} attempts left)'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 16,
                      ),
                    ),
                  )
                else
                  const Text(
                    'Please restart the app',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum AppShellState {
  loading,
  error,
  success,
}

class TimeoutException implements Exception {
  final String message;
  TimeoutException(this.message);

  @override
  String toString() => message;
}
