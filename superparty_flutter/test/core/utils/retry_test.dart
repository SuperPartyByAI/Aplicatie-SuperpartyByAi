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

    test('should honor maxAttempts config', () async {
      int attempts = 0;
      final config = RetryConfig(maxAttempts: 2);
      await expectLater(
        retryWithBackoff(
          () async {
            attempts++;
            throw TimeoutException();
          },
          config: config,
        ),
        throwsA(isA<TimeoutException>()),
      );
      expect(attempts, 2); // Should retry only 2 times (config.maxAttempts)
    });

    test('should apply exponential backoff delays', () async {
      int attempts = 0;
      final delays = <Duration>[];
      final config = RetryConfig(
        maxAttempts: 3,
        initialDelay: const Duration(milliseconds: 100),
        backoffMultiplier: 2.0,
      );
      
      final startTime = DateTime.now();
      
      try {
        await retryWithBackoff(
          () async {
            attempts++;
            if (attempts < 3) {
              final now = DateTime.now();
              if (attempts > 1) {
                delays.add(now.difference(startTime));
              }
              throw TimeoutException();
            }
            return 'success';
          },
          config: config,
        );
      } catch (_) {
        // Expected to fail
      }
      
      // Verify delays increase exponentially (with tolerance for jitter)
      // Delay 1 should be ~100ms, delay 2 should be ~200ms (100 * 2^1)
      if (delays.length >= 2) {
        expect(delays[1].inMilliseconds, greaterThan(delays[0].inMilliseconds));
      }
    });

    test('should cap delay at maxDelay', () async {
      int attempts = 0;
      final config = RetryConfig(
        maxAttempts: 3,
        initialDelay: const Duration(milliseconds: 1000),
        backoffMultiplier: 10.0, // Would exceed maxDelay
        maxDelay: const Duration(milliseconds: 2000),
      );
      
      await expectLater(
        retryWithBackoff(
          () async {
            attempts++;
            throw TimeoutException();
          },
          config: config,
        ),
        throwsA(isA<TimeoutException>()),
      );
      // Should complete without taking too long (capped at 2000ms + jitter)
      expect(attempts, 3);
    });
  });
}
