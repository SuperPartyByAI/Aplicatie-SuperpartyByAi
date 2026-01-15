import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/core/errors/app_exception.dart';
import 'package:superparty_app/core/utils/retry.dart';

void main() {
  group('retryWithBackoff', () {
    test('should NOT retry 401 errors', () async {
      int attempts = 0;
      await expectLater(
        retryWithBackoff(() async {
          attempts++;
          throw UnauthorizedException();
        }),
        throwsA(isA<UnauthorizedException>()),
      );
      expect(attempts, 1); // Should NOT retry
    });

    test('should NOT retry 403 errors', () async {
      int attempts = 0;
      await expectLater(
        retryWithBackoff(() async {
          attempts++;
          throw ForbiddenException();
        }),
        throwsA(isA<ForbiddenException>()),
      );
      expect(attempts, 1); // Should NOT retry
    });

    test('should retry timeout errors (max 3 attempts)', () async {
      int attempts = 0;
      await expectLater(
        retryWithBackoff(() async {
          attempts++;
          throw TimeoutException();
        }),
        throwsA(isA<TimeoutException>()),
      );
      expect(attempts, 3); // Should retry up to maxAttempts
    });

    test('should retry on unknown exceptions (max 3 attempts)', () async {
      int attempts = 0;
      await expectLater(
        retryWithBackoff(() async {
          attempts++;
          throw UnknownException('Test error');
        }),
        throwsA(isA<UnknownException>()),
      );
      expect(attempts, 3);
    });

    test('should return result on success (no retry)', () async {
      int attempts = 0;
      final result = await retryWithBackoff(() async {
        attempts++;
        return 'success';
      });
      expect(result, 'success');
      expect(attempts, 1); // No retry on success
    });
  });
})
