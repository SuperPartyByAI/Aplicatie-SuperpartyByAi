import 'package:firebase_auth/firebase_auth.dart';

/// Maps FirebaseAuthException codes to user-friendly Romanian messages
/// 
/// Provides clear, actionable error messages for authentication failures.
class AuthErrorMapper {
  /// Maps FirebaseAuthException code to Romanian message
  /// 
  /// Returns a tuple: (message, showResetPasswordOption)
  static ({String message, bool showResetPassword}) mapError(
    FirebaseAuthException error,
  ) {
    switch (error.code) {
      case 'invalid-credential':
      case 'wrong-password':
        return (
          message: 'Parolă greșită. Verifică parola și încearcă din nou.',
          showResetPassword: true,
        );

      case 'user-not-found':
        return (
          message: 'Nu există cont cu acest email. Înregistrează-te mai întâi sau verifică adresa de email.',
          showResetPassword: false,
        );

      case 'invalid-email':
        return (
          message: 'Format email invalid. Verifică că ai introdus corect adresa de email.',
          showResetPassword: false,
        );

      case 'email-already-in-use':
        return (
          message: 'Acest email este deja înregistrat. Încearcă să te loghezi sau folosește alt email.',
          showResetPassword: false,
        );

      case 'weak-password':
        return (
          message: 'Parola este prea slabă. Folosește minim 6 caractere și combină litere, cifre și simboluri pentru securitate mai bună.',
          showResetPassword: false,
        );

      case 'too-many-requests':
        return (
          message: 'Prea multe încercări de conectare. Așteaptă câteva minute și încearcă din nou. Dacă problema persistă, poți reseta parola.',
          showResetPassword: true,
        );

      case 'network-request-failed':
        return (
          message: 'Eroare de conexiune. Verifică conexiunea la internet și încearcă din nou.',
          showResetPassword: false,
        );

      case 'user-disabled':
        return (
          message: 'Contul tău a fost dezactivat. Contactează administratorul pentru asistență.',
          showResetPassword: false,
        );

      case 'operation-not-allowed':
        return (
          message: 'Această metodă de autentificare nu este permisă. Contactează administratorul.',
          showResetPassword: false,
        );

      case 'requires-recent-login':
        return (
          message: 'Această operațiune necesită autentificare recentă. Te rog să te loghezi din nou.',
          showResetPassword: false,
        );

      case 'invalid-verification-code':
        return (
          message: 'Cod de verificare invalid sau expirat. Te rog să soliciți un cod nou.',
          showResetPassword: false,
        );

      case 'invalid-verification-id':
        return (
          message: 'ID de verificare invalid. Te rog să soliciți un cod nou.',
          showResetPassword: false,
        );

      default:
        // Fallback for unknown error codes
        final errorMessage = error.message ?? 'Eroare necunoscută';
        return (
          message: 'A apărut o eroare la autentificare: $errorMessage. Te rog încearcă din nou.',
          showResetPassword: error.code.contains('password') || error.code.contains('credential'),
        );
    }
  }

  /// Gets a short error code for logging (without sensitive info)
  static String getErrorCode(FirebaseAuthException error) {
    return error.code;
  }
}