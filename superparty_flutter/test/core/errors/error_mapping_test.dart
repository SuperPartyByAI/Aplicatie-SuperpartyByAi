import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/core/errors/app_exception.dart';
import 'package:cloud_functions/cloud_functions.dart';

void main() {
  group('ErrorMapper', () {
    test('maps unauthenticated to UnauthorizedException', () {
      final e = FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'Not authenticated',
      );
      final mapped = ErrorMapper.fromFirebaseFunctionsException(e);
      expect(mapped, isA<UnauthorizedException>());
      expect(mapped.code, 'unauthorized');
    });

    test('maps permission-denied to ForbiddenException', () {
      final e = FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'Access denied',
      );
      final mapped = ErrorMapper.fromFirebaseFunctionsException(e);
      expect(mapped, isA<ForbiddenException>());
      expect(mapped.code, 'forbidden');
    });

    test('maps HTTP 401 to UnauthorizedException', () {
      final mapped = ErrorMapper.fromHttpException(401, 'Unauthorized');
      expect(mapped, isA<UnauthorizedException>());
    });

    test('maps HTTP 403 to ForbiddenException', () {
      final mapped = ErrorMapper.fromHttpException(403, 'Forbidden');
      expect(mapped, isA<ForbiddenException>());
    });

    test('maps HTTP 408/504 to TimeoutException', () {
      final mapped408 = ErrorMapper.fromHttpException(408, 'Request timeout');
      expect(mapped408, isA<TimeoutException>());

      final mapped504 = ErrorMapper.fromHttpException(504, 'Gateway timeout');
      expect(mapped504, isA<TimeoutException>());
    });

    test('maps unknown HTTP status to NetworkException', () {
      final mapped = ErrorMapper.fromHttpException(500, 'Internal server error');
      expect(mapped, isA<NetworkException>());
      expect(mapped.code, '500');
    });
  });
}
