import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_functions/cloud_functions.dart';

void main() {
  group('AI Chat Error Mapping', () {
    test('unauthenticated -> login message', () {
      final error = FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'User must be authenticated',
      );
      final msg = _mapError(error);
      expect(msg, contains('logat'));
    });

    test('failed-precondition -> config message', () {
      final error = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'Key missing',
      );
      final msg = _mapError(error);
      expect(msg, contains('configurat'));
    });

    test('deadline-exceeded -> timeout message', () {
      final error = FirebaseFunctionsException(
        code: 'deadline-exceeded',
        message: 'Timeout',
      );
      final msg = _mapError(error);
      expect(msg, contains('Timeout'));
    });

    test('all errors are user-friendly', () {
      final codes = ['unauthenticated', 'failed-precondition', 'internal'];
      for (final code in codes) {
        final error = FirebaseFunctionsException(code: code, message: 'Test');
        final msg = _mapError(error);
        expect(msg, isNot(contains('Exception')));
        expect(msg.length, greaterThan(10));
      }
    });
  });
}

String _mapError(FirebaseFunctionsException e) {
  switch (e.code) {
    case 'unauthenticated':
      return 'Trebuie să fii logat ca să folosești AI.';
    case 'failed-precondition':
      return 'AI Chat nu este configurat corect.';
    case 'invalid-argument':
      return 'Mesaj invalid.';
    case 'deadline-exceeded':
      return 'Timeout - AI-ul nu a răspuns la timp.';
    case 'resource-exhausted':
      return 'Prea multe cereri.';
    case 'internal':
      return 'Eroare server.';
    case 'unavailable':
      return 'Serviciu indisponibil temporar.';
    default:
      return 'Eroare: ${e.message ?? e.code}';
  }
}
