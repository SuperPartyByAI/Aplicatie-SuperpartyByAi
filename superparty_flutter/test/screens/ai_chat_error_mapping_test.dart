import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Test error mapping logic for AI Chat
/// 
/// This tests the pure function logic without requiring a full widget test
void main() {
  group('AI Chat Error Mapping', () {
    test('maps unauthenticated error correctly', () {
      final error = FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'User must be authenticated',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('logat'));
      expect(mapped, contains('loghează-te'));
    });

    test('maps failed-precondition error correctly', () {
      final error = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'GROQ_API_KEY not configured',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('configurat'));
      expect(mapped, contains('cheie API'));
      expect(mapped, contains('administrator'));
    });

    test('maps invalid-argument error correctly', () {
      final error = FirebaseFunctionsException(
        code: 'invalid-argument',
        message: 'Messages array required',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('invalidă'));
    });

    test('maps deadline-exceeded error correctly', () {
      final error = FirebaseFunctionsException(
        code: 'deadline-exceeded',
        message: 'Timeout',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('Timeout'));
      expect(mapped, contains('Încearcă din nou'));
    });

    test('maps resource-exhausted error correctly', () {
      final error = FirebaseFunctionsException(
        code: 'resource-exhausted',
        message: 'Too many requests',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('multe cereri'));
      expect(mapped, contains('așteaptă'));
    });

    test('maps internal error correctly', () {
      final error = FirebaseFunctionsException(
        code: 'internal',
        message: 'Internal server error',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('internă'));
      expect(mapped, contains('server'));
    });

    test('maps unavailable error correctly', () {
      final error = FirebaseFunctionsException(
        code: 'unavailable',
        message: 'Service unavailable',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('indisponibil'));
    });

    test('maps unknown error code with message', () {
      final error = FirebaseFunctionsException(
        code: 'unknown-code',
        message: 'Some error message',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('Some error message'));
    });

    test('maps unknown error code without message', () {
      final error = FirebaseFunctionsException(
        code: 'unknown-code',
      );

      final mapped = _mapFirebaseError(error);

      expect(mapped, contains('unknown-code'));
    });
  });
}

/// Extracted error mapping function for testing
/// This is the same logic as in AIChatScreen._mapFirebaseError
String _mapFirebaseError(FirebaseFunctionsException e) {
  switch (e.code) {
    case 'unauthenticated':
      return 'Trebuie să fii logat ca să folosești AI. Te rog loghează-te mai întâi.';
    case 'failed-precondition':
      return 'AI nu este configurat pe server (cheie API lipsă). Contactează administratorul.';
    case 'invalid-argument':
      return 'Cerere invalidă. Încearcă din nou sau contactează suportul.';
    case 'deadline-exceeded':
      return 'Timeout. Serverul nu a răspuns la timp. Încearcă din nou.';
    case 'resource-exhausted':
      return 'Prea multe cereri. Te rog așteaptă câteva secunde și încearcă din nou.';
    case 'internal':
      return 'Eroare internă pe server. Încearcă din nou mai târziu.';
    case 'unavailable':
      return 'Serviciul AI este temporar indisponibil. Încearcă din nou.';
    default:
      return 'Eroare: ${e.message ?? e.code}';
  }
}
