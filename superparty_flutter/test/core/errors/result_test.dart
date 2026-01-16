import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/core/errors/result.dart';

void main() {
  group('Result', () {
    test('Success creates successful result', () {
      final result = Result.success(42);
      
      expect(result.isSuccess, isTrue);
      expect(result.isFailure, isFalse);
      expect(result.value, equals(42));
      expect(result.valueOrNull, equals(42));
      expect(result.errorOrNull, isNull);
    });

    test('Failure creates failure result', () {
      final result = Result<int>.failure('Something went wrong');
      
      expect(result.isSuccess, isFalse);
      expect(result.isFailure, isTrue);
      expect(result.valueOrNull, isNull);
      expect(result.errorOrNull, equals('Something went wrong'));
    });

    test('value throws on Failure', () {
      final result = Result<int>.failure('Error');
      
      expect(() => result.value, throwsStateError);
    });

    test('map transforms Success value', () {
      final result = Result.success(5);
      final mapped = result.map((value) => value * 2);
      
      expect(mapped.isSuccess, isTrue);
      expect(mapped.value, equals(10));
    });

    test('map preserves Failure', () {
      final result = Result<int>.failure('Error');
      final mapped = result.map((value) => value * 2);
      
      expect(mapped.isFailure, isTrue);
      expect(mapped.errorOrNull, equals('Error'));
    });

    test('flatMap chains Success', () {
      final result = Result.success(5);
      final mapped = result.flatMap((value) => Result.success(value * 2));
      
      expect(mapped.isSuccess, isTrue);
      expect(mapped.value, equals(10));
    });

    test('flatMap short-circuits on Failure', () {
      final result = Result<int>.failure('Error');
      final mapped = result.flatMap((value) => Result.success(value * 2));
      
      expect(mapped.isFailure, isTrue);
      expect(mapped.errorOrNull, equals('Error'));
    });

    test('getOrElse returns value on Success', () {
      final result = Result.success(42);
      
      expect(result.getOrElse(0), equals(42));
    });

    test('getOrElse returns default on Failure', () {
      final result = Result<int>.failure('Error');
      
      expect(result.getOrElse(0), equals(0));
    });

    test('onSuccess callback is called on Success', () {
      final result = Result.success(42);
      int? capturedValue;
      
      result.onSuccess((value) {
        capturedValue = value;
      });
      
      expect(capturedValue, equals(42));
    });

    test('onSuccess callback is not called on Failure', () {
      final result = Result<int>.failure('Error');
      bool called = false;
      
      result.onSuccess((value) {
        called = true;
      });
      
      expect(called, isFalse);
    });

    test('onFailure callback is called on Failure', () {
      final result = Result<int>.failure('Error', code: 'test_error');
      String? capturedMessage;
      String? capturedCode;
      
      result.onFailure((message, code, error) {
        capturedMessage = message;
        capturedCode = code;
      });
      
      expect(capturedMessage, equals('Error'));
      expect(capturedCode, equals('test_error'));
    });

    test('onFailure callback is not called on Success', () {
      final result = Result.success(42);
      bool called = false;
      
      result.onFailure((message, code, error) {
        called = true;
      });
      
      expect(called, isFalse);
    });

    test('when pattern matching for Success', () {
      final result = Result.success(42);
      
      final output = result.when(
        success: (value) => 'Value: $value',
        failure: (message, code, error) => 'Error: $message',
      );
      
      expect(output, equals('Value: 42'));
    });

    test('when pattern matching for Failure', () {
      final result = Result<int>.failure('Something went wrong');
      
      final output = result.when(
        success: (value) => 'Value: $value',
        failure: (message, code, error) => 'Error: $message',
      );
      
      expect(output, equals('Error: Something went wrong'));
    });

    test('Success equality', () {
      final result1 = Result.success(42);
      final result2 = Result.success(42);
      final result3 = Result.success(43);
      
      expect(result1, equals(result2));
      expect(result1, isNot(equals(result3)));
    });

    test('Failure equality', () {
      final result1 = Result<int>.failure('Error', code: 'test');
      final result2 = Result<int>.failure('Error', code: 'test');
      final result3 = Result<int>.failure('Different', code: 'test');
      
      expect(result1, equals(result2));
      expect(result1, isNot(equals(result3)));
    });
  });

  group('FutureResultExtension', () {
    test('toResult converts successful Future to Success', () async {
      final future = Future.value(42);
      final result = await future.toResult();
      
      expect(result.isSuccess, isTrue);
      expect(result.value, equals(42));
    });

    test('toResult converts failed Future to Failure', () async {
      final future = Future<int>.error(Exception('Something went wrong'));
      final result = await future.toResult();
      
      expect(result.isFailure, isTrue);
      expect(result.errorOrNull, contains('Something went wrong'));
    });
  });

  group('ResultCatchExtension', () {
    test('tryCatch wraps successful function', () {
      final result = ResultCatchExtension.tryCatch(() => 42);
      
      expect(result.isSuccess, isTrue);
      expect(result.value, equals(42));
    });

    test('tryCatch catches exceptions', () {
      final result = ResultCatchExtension.tryCatch<int>(() {
        throw Exception('Something went wrong');
      });
      
      expect(result.isFailure, isTrue);
      expect(result.errorOrNull, contains('Something went wrong'));
    });

    test('tryCatchAsync wraps successful async function', () async {
      final result = await ResultCatchExtension.tryCatchAsync(() async => 42);
      
      expect(result.isSuccess, isTrue);
      expect(result.value, equals(42));
    });

    test('tryCatchAsync catches async exceptions', () async {
      final result = await ResultCatchExtension.tryCatchAsync<int>(() async {
        throw Exception('Something went wrong');
      });
      
      expect(result.isFailure, isTrue);
      expect(result.errorOrNull, contains('Something went wrong'));
    });
  });
}
