import 'package:flutter/foundation.dart';

/// Global test setup to mute debugPrint during tests
/// 
/// Simply import this file at the top of your test file:
/// ```dart
/// import '../test_setup.dart';
/// 
/// void main() {
///   setUpAll(() {
///     muteDebugPrint();
///   });
///   // ... your tests
/// }
/// ```

// Store original debugPrint
final _originalDebugPrint = debugPrint;

/// Mute debugPrint during tests
void muteDebugPrint() {
  debugPrint = (String? message, {int? wrapWidth}) {};
}

/// Restore original debugPrint
void restoreDebugPrint() {
  debugPrint = _originalDebugPrint;
}
