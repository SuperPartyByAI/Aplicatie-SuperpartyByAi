import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../theme/app_theme.dart';

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
    final theme = Theme.of(context);
    final colors = theme.extension<AppColors>();
    
    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              colors?.gradientStart ?? theme.colorScheme.surface,
              colors?.gradientEnd ?? theme.colorScheme.surface,
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
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.8),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Autentificare necesară',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Trebuie să fii logat ca să accesezi această pagină.',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontSize: 16,
                      color: colors?.textMuted ?? theme.colorScheme.onSurface.withValues(alpha: 0.7),
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
                        backgroundColor: theme.colorScheme.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(
                        'Autentifică-te',
                        style: TextStyle(
                          fontSize: 16,
                          color: theme.colorScheme.onPrimary,
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
                    child: Text(
                      'Înapoi',
                      style: TextStyle(
                        fontSize: 16,
                        color: theme.colorScheme.primary,
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