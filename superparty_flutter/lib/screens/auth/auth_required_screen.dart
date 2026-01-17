import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Screen shown when user tries to access a protected route without authentication
/// 
/// Keeps the user on the intended route (e.g., /evenimente) instead of redirecting.
/// Provides clear actions: login or go back.
class AuthRequiredScreen extends StatelessWidget {
  /// The route that triggered this screen (e.g., "/evenimente")
  final String fromRoute;

  const AuthRequiredScreen({
    super.key,
    required this.fromRoute,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF111C35),
              Color(0xFF0B1220),
            ],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.lock_outline,
                    size: 80,
                    color: Colors.white.withValues(alpha: 0.8),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Autentificare necesară',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Trebuie să fii logat ca să accesezi această pagină.',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.white.withValues(alpha: 0.7),
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: () {
                        // Navigate to login with return route preserved
                        final from = Uri.encodeComponent(fromRoute);
                        context.go('/?from=$from');
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF20C997),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text(
                        'Autentifică-te',
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () {
                      // Go back or to home
                      if (context.canPop()) {
                        context.pop();
                      } else {
                        context.go('/home');
                      }
                    },
                    child: const Text(
                      'Înapoi',
                      style: TextStyle(
                        fontSize: 16,
                        color: Color(0xFF20C997),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}