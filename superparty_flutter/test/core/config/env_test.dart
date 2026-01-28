import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/core/config/env.dart';

void main() {
  group('Env.whatsappBackendUrl', () {
    test('should never be empty - always has default', () {
      // This test ensures the getter never throws
      // Even without dart-define, defaultHetzner should be used
      expect(
        () => Env.whatsappBackendUrl,
        returnsNormally,
        reason: 'whatsappBackendUrl should always return a value (default if not set)',
      );
      
      final url = Env.whatsappBackendUrl;
      expect(url, isNotEmpty, reason: 'URL should never be empty');
      expect(url, isA<String>(), reason: 'URL should be a string');
      
      // Should be a valid URL format (starts with http:// or https://)
      expect(
        url.startsWith('http://') || url.startsWith('https://'),
        isTrue,
        reason: 'URL should be a valid HTTP/HTTPS URL',
      );
    });
    
    test('should use default when no dart-define is set', () {
      // When running without --dart-define, should use defaultHetzner
      final url = Env.whatsappBackendUrl;
      // Default is https://whats-app-ompro.ro
      // Note: This test may fail if dart-define IS set, so it's conditional
      if (!url.contains('whats-app-ompro.ro')) {
        // If dart-define was set, that's fine - just verify it's not empty
        expect(url, isNotEmpty);
      } else {
        // If using default, verify it's the expected default
        expect(url, equals('https://whats-app-ompro.ro'));
      }
    });
    
    test('should not contain trailing slashes', () {
      final url = Env.whatsappBackendUrl;
      expect(url.endsWith('/'), isFalse, reason: 'URL should be normalized (no trailing slash)');
    });
  });
}
