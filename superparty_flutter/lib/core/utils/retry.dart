import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';
import '../errors/app_exception.dart';

/// Retry configuration
class RetryConfig {
  final int maxAttempts;
  final Duration initialDelay;
  final double backoffMultiplier;
  final Duration maxDelay;
  final bool Function(dynamic)? shouldRetry;

  const RetryConfig({
    this.maxAttempts = 3,
    this.initialDelay = const Duration(milliseconds: 400),
    this.backoffMultiplier = 2.0,
    this.maxDelay = const Duration(seconds: 4),
    this.shouldRetry,
  });

  /// Default: retry only transient errors
  bool defaultShouldRetry(dynamic e) {
    // Handle FirebaseFunctionsException
    if (e is FirebaseFunctionsException) {
      return _isRetryableFirebaseFunctionError(e.code);
    }
    
    // Handle AppException
    if (e is UnauthorizedException || e is ForbiddenException) {
      return false; // Never retry auth/permission errors
    }
    
    // Other errors: retry
    return true;
  }

  /// Check if FirebaseFunctionsException error code is retryable
  static bool _isRetryableFirebaseFunctionError(String code) {
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
}

/// Retry a function with exponential backoff
/// 
/// Retries transient errors (unavailable, deadline-exceeded, internal, resource-exhausted).
/// Does NOT retry auth/permission errors (unauthenticated, permission-denied).
/// 
/// Example:
/// ```dart
/// final result = await retryWithBackoff(
///   () => callable.call(params),
///   config: RetryConfig(maxAttempts: 4),
/// );
/// ```
Future<T> retryWithBackoff<T>(
  Future<T> Function() fn, {
  RetryConfig? config,
}) async {
  final cfg = config ?? const RetryConfig();
  final shouldRetry = cfg.shouldRetry ?? cfg.defaultShouldRetry;

  dynamic lastError;
  int attempt = 0;

  while (attempt < cfg.maxAttempts) {
    attempt++;
    
    try {
      return await fn();
    } catch (e) {
      lastError = e;

      // Don't retry if shouldRetry returns false
      if (!shouldRetry(e)) {
        rethrow;
      }

      // Max attempts reached?
      if (attempt >= cfg.maxAttempts) {
        break; // Will rethrow below
      }

      // Calculate delay with exponential backoff + jitter
      final exponentialDelay = cfg.initialDelay.inMilliseconds * pow(cfg.backoffMultiplier, attempt - 1);
      final cappedDelayMs = exponentialDelay.clamp(
        cfg.initialDelay.inMilliseconds.toDouble(),
        cfg.maxDelay.inMilliseconds.toDouble(),
      ).toInt();
      
      final jitter = Random().nextInt(cappedDelayMs ~/ 4); // +/- 25% jitter
      final finalDelayMs = cappedDelayMs + jitter;

      await Future.delayed(Duration(milliseconds: finalDelayMs));
    }
  }

  // All retries exhausted - rethrow last error
  if (lastError is AppException) {
    throw lastError;
  } else if (lastError != null) {
    throw lastError;
  } else {
    throw UnknownException('Retry exhausted after ${cfg.maxAttempts} attempts');
  }
}
