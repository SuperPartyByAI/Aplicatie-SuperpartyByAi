import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

/// Retry helper with exponential backoff for Firebase Functions calls
/// 
/// Usage:
/// ```dart
/// final result = await retryWithBackoff(
///   () => callable.call(params),
///   operationName: 'extractEvent',
/// );
/// ```
class RetryHelper {
  /// Retry a function call with exponential backoff and jitter
  /// 
  /// Only retries transient errors:
  /// - unavailable (service temporarily down)
  /// - deadline-exceeded (timeout)
  /// - internal (server error, may be transient)
  /// - resource-exhausted (quota, may recover)
  /// 
  /// Does NOT retry:
  /// - unauthenticated (auth issue, won't fix with retry)
  /// - permission-denied (authz issue, won't fix)
  /// - invalid-argument (bad request, won't fix)
  /// - not-found (resource missing, won't fix)
  static Future<T> retryWithBackoff<T>(
    Future<T> Function() operation, {
    int maxAttempts = 4,
    int baseDelayMs = 400,
    int maxDelayMs = 4000,
    String operationName = 'operation',
  }) async {
    int attempt = 0;
    final random = Random();

    while (true) {
      attempt++;
      
      try {
        debugPrint('[$operationName] Attempt $attempt/$maxAttempts');
        final result = await operation();
        
        if (attempt > 1) {
          debugPrint('[$operationName] ✅ Succeeded on attempt $attempt');
        }
        
        return result;
      } on FirebaseFunctionsException catch (e) {
        final isRetryable = _isRetryableError(e.code);
        final isLastAttempt = attempt >= maxAttempts;

        if (!isRetryable || isLastAttempt) {
          debugPrint('[$operationName] ❌ Failed: ${e.code} - ${e.message}');
          if (!isRetryable) {
            debugPrint('[$operationName] Non-retryable error, throwing immediately');
          } else {
            debugPrint('[$operationName] Max attempts reached, throwing');
          }
          rethrow;
        }

        // Calculate delay with exponential backoff + jitter
        final exponentialDelay = baseDelayMs * (1 << (attempt - 1));
        final cappedDelay = exponentialDelay.clamp(baseDelayMs, maxDelayMs);
        final jitter = random.nextInt(cappedDelay ~/ 4); // +/- 25% jitter
        final finalDelay = cappedDelay + jitter;

        debugPrint('[$operationName] ⚠️  Attempt $attempt failed (${e.code}), retrying in ${finalDelay}ms...');
        await Future.delayed(Duration(milliseconds: finalDelay));
      } catch (e) {
        debugPrint('[$operationName] ❌ Unexpected error: $e');
        rethrow;
      }
    }
  }

  /// Check if a FirebaseFunctionsException error code is retryable
  static bool _isRetryableError(String code) {
    switch (code) {
      case 'unavailable':           // Service temporarily unavailable
      case 'deadline-exceeded':     // Timeout (may succeed on retry)
      case 'internal':              // Server error (may be transient)
      case 'resource-exhausted':    // Quota/rate limit (may recover)
        return true;
      
      case 'unauthenticated':       // Auth missing/invalid
      case 'permission-denied':     // Authz failed
      case 'invalid-argument':      // Bad request
      case 'not-found':             // Resource doesn't exist
      case 'already-exists':        // Conflict
      case 'failed-precondition':   // Precondition not met
      case 'aborted':               // Concurrency conflict
      case 'out-of-range':          // Invalid range
      case 'unimplemented':         // Not supported
      case 'data-loss':             // Unrecoverable data loss
      case 'cancelled':             // Client cancelled
        return false;
      
      default:
        // Unknown codes: don't retry (safer default)
        return false;
    }
  }

  /// Generate a unique trace ID for request tracking
  static String generateTraceId() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = Random().nextInt(999999).toString().padLeft(6, '0');
    return 'trace_${timestamp}_$random';
  }
}
