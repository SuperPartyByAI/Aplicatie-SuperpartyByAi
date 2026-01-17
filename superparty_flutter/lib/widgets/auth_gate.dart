import 'package:flutter/material.dart';
import '../services/firebase_service.dart';
import '../screens/auth/auth_required_screen.dart';

/// Auth gate widget that shows AuthRequiredScreen if user is not authenticated
/// 
/// Keeps the user on the intended route instead of redirecting.
/// This prevents navigation bounce when accessing protected routes while logged out.
class AuthGate extends StatelessWidget {
  /// The child widget to show when authenticated
  final Widget child;
  
  /// The route that triggered this gate (for return-after-login)
  final String fromRoute;

  const AuthGate({
    super.key,
    required this.child,
    required this.fromRoute,
  });

  @override
  Widget build(BuildContext context) {
    // Synchronous check - no async in build
    final user = FirebaseService.currentUser;
    
    if (user == null) {
      return AuthRequiredScreen(fromRoute: fromRoute);
    }
    
    return child;
  }
}