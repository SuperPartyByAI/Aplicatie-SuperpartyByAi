/// A Result type for safe error handling without throwing exceptions
/// Inspired by functional programming patterns (Either/Result)
sealed class Result<T> {
  const Result();

  /// Creates a successful result
  factory Result.success(T value) = Success<T>;

  /// Creates a failure result
  factory Result.failure(String message, {String? code, Object? error}) = Failure<T>;

  /// Checks if this is a success
  bool get isSuccess => this is Success<T>;

  /// Checks if this is a failure
  bool get isFailure => this is Failure<T>;

  /// Gets the value if success, otherwise throws
  T get value {
    if (this is Success<T>) {
      return (this as Success<T>).data;
    }
    throw StateError('Cannot get value from Failure: ${(this as Failure<T>).message}');
  }

  /// Gets the value if success, otherwise returns null
  T? get valueOrNull {
    if (this is Success<T>) {
      return (this as Success<T>).data;
    }
    return null;
  }

  /// Gets the error message if failure, otherwise returns null
  String? get errorOrNull {
    if (this is Failure<T>) {
      return (this as Failure<T>).message;
    }
    return null;
  }

  /// Maps the success value to a new type
  Result<R> map<R>(R Function(T value) transform) {
    if (this is Success<T>) {
      try {
        return Result.success(transform((this as Success<T>).data));
      } catch (e) {
        return Result.failure('Transform failed: $e', error: e);
      }
    }
    final failure = this as Failure<T>;
    return Result.failure(failure.message, code: failure.code, error: failure.error);
  }

  /// Flat-maps the success value to a new Result
  Result<R> flatMap<R>(Result<R> Function(T value) transform) {
    if (this is Success<T>) {
      try {
        return transform((this as Success<T>).data);
      } catch (e) {
        return Result.failure('FlatMap failed: $e', error: e);
      }
    }
    final failure = this as Failure<T>;
    return Result.failure(failure.message, code: failure.code, error: failure.error);
  }

  /// Returns value on success, or default value on failure
  T getOrElse(T defaultValue) {
    if (this is Success<T>) {
      return (this as Success<T>).data;
    }
    return defaultValue;
  }

  /// Executes callback on success
  void onSuccess(void Function(T value) callback) {
    if (this is Success<T>) {
      callback((this as Success<T>).data);
    }
  }

  /// Executes callback on failure
  void onFailure(void Function(String message, String? code, Object? error) callback) {
    if (this is Failure<T>) {
      final failure = this as Failure<T>;
      callback(failure.message, failure.code, failure.error);
    }
  }

  /// Pattern matching helper
  R when<R>({
    required R Function(T value) success,
    required R Function(String message, String? code, Object? error) failure,
  }) {
    if (this is Success<T>) {
      return success((this as Success<T>).data);
    } else {
      final fail = this as Failure<T>;
      return failure(fail.message, fail.code, fail.error);
    }
  }
}

/// Success result containing data
final class Success<T> extends Result<T> {
  final T data;
  const Success(this.data);

  @override
  String toString() => 'Success($data)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Success<T> && runtimeType == other.runtimeType && data == other.data;

  @override
  int get hashCode => data.hashCode;
}

/// Failure result containing error information
final class Failure<T> extends Result<T> {
  final String message;
  final String? code;
  final Object? error;

  const Failure(this.message, {this.code, this.error});

  @override
  String toString() => 'Failure(${code != null ? "[$code] " : ""}$message)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Failure<T> &&
          runtimeType == other.runtimeType &&
          message == other.message &&
          code == other.code;

  @override
  int get hashCode => Object.hash(message, code);
}

  /// Helper extension to convert Future<T> to Future<Result<T>>
extension FutureResultExtension<T> on Future<T> {
  /// Catches any error and wraps in Result
  Future<Result<T>> toResult() async {
    try {
      final value = await this;
      return Result.success(value);
    } catch (e) {
      return Result.failure(
        e.toString().replaceFirst(RegExp(r'^Exception:\s*'), ''),
        error: e,
      );
    }
  }
}

/// Helper extension to run code safely and return Result
extension ResultCatchExtension on Object? {
  /// Runs a function and catches any errors, returning a Result
  static Result<T> tryCatch<T>(T Function() fn) {
    try {
      return Result.success(fn());
    } catch (e) {
      return Result.failure(
        e.toString().replaceFirst(RegExp(r'^Exception:\s*'), ''),
        error: e,
      );
    }
  }

  /// Runs an async function and catches any errors, returning a Result
  static Future<Result<T>> tryCatchAsync<T>(Future<T> Function() fn) async {
    try {
      return Result.success(await fn());
    } catch (e) {
      return Result.failure(
        e.toString().replaceFirst(RegExp(r'^Exception:\s*'), ''),
        error: e,
      );
    }
  }
}
