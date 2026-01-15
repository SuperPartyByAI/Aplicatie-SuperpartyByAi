import 'dart:math';
import '../errors/app_exception.dart';

/// Retry configuration
class RetryConfig {
  final int maxAttempts;
  final Duration initialDelay;
  final double backoffMultiplier;
  final Duration maxDelay;
  final bool Function(AppException)? shouldRetry;

  const RetryConfig({
    this.maxAttempts = 3,
    this.initialDelay = const Duration(milliseconds: 500),
    this.backoffMultiplier = 2.0,
    this.maxDelay = const Duration(seconds: 10),
    this.shouldRetry,
  });

  /// Default: retry everything except 401/403
  bool defaultShouldRetry(AppException e) {
    if (e is UnauthorizedException || e is ForbiddenException) {
      return false; // Never retry auth/permission errors
    }
    return true;
  }
}

/// Retry a function with exponential backoff
/// 
/// Does NOT retry 401/403 errors.
/// 
/// Example:
/// ```dart
/// final result = await retryWithBackoff(
///   () => service.allocateStaffCode(teamId: 'team_a'),
///   config: RetryConfig(maxAttempts: 3),
/// );
/// ```
Future<T> retryWithBackoff<T>(
  Future<T> Function() fn, {
  RetryConfig? config,
}) async {
  final cfg = config ?? const RetryConfig();
  final shouldRetry = cfg.shouldRetry ?? cfg.defaultShouldRetry;

  AppException? lastError;
  int attempt = 0;

  while (attempt < cfg.maxAttempts) {
    try {
      return await fn();
    } catch (e) {
      lastError = e is AppException
          ? e
          : ErrorMapper.fromFirebaseFunctionsException(e);

      // Don't retry if shouldRetry returns false
      if (!shouldRetry(lastError)) {
        rethrow;
      }

      attempt++;
      if (attempt >= cfg.maxAttempts) {
        break; // Max attempts reached
      }

      // Calculate delay with jitter
      final baseDelay = cfg.initialDelay * pow(cfg.backoffMultiplier, attempt - 1);
      final cappedDelay = baseDelay > cfg.maxDelay ? cfg.maxDelay : baseDelay;
      final jitter = Duration(milliseconds: Random().nextInt(200));
      final delay = cappedDelay + jitter;

      await Future.delayed(delay);
    }
  }

  // All retries exhausted
  throw lastError ?? UnknownException('Retry exhausted after ${cfg.maxAttempts} attempts');
}
