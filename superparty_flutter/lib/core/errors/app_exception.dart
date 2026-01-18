/// Base exception for app-level errors
abstract class AppException implements Exception {
  final String message;
  final String? code;
  final Object? originalError;

  AppException(this.message, {this.code, this.originalError});

  @override
  String toString() => code != null ? '[$code] $message' : message;
}

/// Domain-level failures (business logic errors)
class DomainFailure extends AppException {
  DomainFailure(super.message, {super.code, super.originalError});
}

/// Network-related errors
class NetworkException extends AppException {
  NetworkException(super.message, {super.code, super.originalError});
}

/// Authentication errors (401)
class UnauthorizedException extends AppException {
  UnauthorizedException([String? message])
      : super(message ?? 'Nu ești autentificat.', code: 'unauthorized');
}

/// Permission errors (403)
class ForbiddenException extends AppException {
  ForbiddenException([String? message])
      : super(message ?? 'Nu ai permisiuni pentru această acțiune.', code: 'forbidden');
}

/// Timeout errors
class TimeoutException extends AppException {
  TimeoutException([String? message])
      : super(message ?? 'Timeout: cererea a durat prea mult.', code: 'timeout');
}

/// Service unavailable errors (503 - PASSIVE mode, backend down, etc.)
class ServiceUnavailableException extends AppException {
  final String? mode; // 'passive' | 'active' | null
  final String? instanceId;
  final String? holderInstanceId;
  final int? retryAfterSeconds;
  
  ServiceUnavailableException(
    super.message, {
    this.mode,
    this.instanceId,
    this.holderInstanceId,
    this.retryAfterSeconds,
    super.originalError,
  }) : super(code: 'service_unavailable');
}

/// Unknown/unexpected errors
class UnknownException extends AppException {
  UnknownException(super.message, {super.originalError}) : super(code: 'unknown');
}

/// Helper to map Firebase Functions exceptions to typed errors
class ErrorMapper {
  static AppException fromFirebaseFunctionsException(dynamic e) {
    if (e is Exception) {
      final str = e.toString().toLowerCase();
      if (str.contains('unauthenticated') || str.contains('401')) {
        return UnauthorizedException();
      }
      if (str.contains('permission-denied') || str.contains('403') || str.contains('forbidden')) {
        return ForbiddenException();
      }
      if (str.contains('timeout') || str.contains('deadline exceeded')) {
        return TimeoutException();
      }
    }

    // Try to extract message
    final message = e.toString().replaceFirst(RegExp(r'^(Exception|StateError|Error):\s*'), '');
    return UnknownException(message, originalError: e);
  }

  static AppException fromHttpException(
    int statusCode, 
    String? message, {
    Map<String, dynamic>? responseBody,
  }) {
    switch (statusCode) {
      case 401:
        return UnauthorizedException(message);
      case 403:
        return ForbiddenException(message);
      case 503:
        // Service unavailable - could be PASSIVE mode
        final mode = responseBody?['mode'] as String?;
        final instanceId = responseBody?['instanceId'] as String?;
        final holderInstanceId = responseBody?['holderInstanceId'] as String?;
        final retryAfterSeconds = responseBody?['retryAfterSeconds'] as int?;
        final errorMsg = message ?? 
                        responseBody?['message'] as String? ?? 
                        'Serviciul nu este disponibil momentan.';
        return ServiceUnavailableException(
          errorMsg,
          mode: mode,
          instanceId: instanceId,
          holderInstanceId: holderInstanceId,
          retryAfterSeconds: retryAfterSeconds,
          originalError: responseBody,
        );
      case 408:
      case 504:
        return TimeoutException(message);
      default:
        return NetworkException(message ?? 'HTTP $statusCode', code: statusCode.toString());
    }
  }
}
