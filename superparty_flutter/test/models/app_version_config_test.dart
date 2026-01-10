import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/models/app_version_config.dart';

void main() {
  group('AppVersionConfig', () {
    group('fromFirestore', () {
      test('parses valid data correctly', () {
        final data = {
          'min_version': '1.0.1',
          'min_build_number': 2,
          'force_update': true,
          'update_message': 'Test message',
          'release_notes': 'Test notes',
          'android_download_url': 'https://example.com/app.apk',
          'ios_download_url': 'https://example.com/app.ipa',
        };

        final config = AppVersionConfig.fromFirestore(data);

        expect(config.minVersion, '1.0.1');
        expect(config.minBuildNumber, 2);
        expect(config.forceUpdate, true);
        expect(config.updateMessage, 'Test message');
        expect(config.releaseNotes, 'Test notes');
        expect(config.androidDownloadUrl, 'https://example.com/app.apk');
        expect(config.iosDownloadUrl, 'https://example.com/app.ipa');
      });

      test('uses default values for optional fields', () {
        final data = {
          'min_version': '1.0.0',
          'min_build_number': 1,
        };

        final config = AppVersionConfig.fromFirestore(data);

        expect(config.minVersion, '1.0.0');
        expect(config.minBuildNumber, 1);
        expect(config.forceUpdate, false); // default
        expect(config.updateMessage, isNotEmpty); // default message
        expect(config.releaseNotes, ''); // default
        expect(config.androidDownloadUrl, null);
        expect(config.iosDownloadUrl, null);
      });

      test('returns safe defaults when min_version is missing', () {
        final data = {
          'min_build_number': 1,
        };

        final config = AppVersionConfig.fromFirestore(data);
        expect(config.minVersion, '1.0.0'); // safe default
      });

      test('returns safe defaults when min_build_number is missing', () {
        final data = {
          'min_version': '1.0.0',
        };

        final config = AppVersionConfig.fromFirestore(data);
        expect(config.minBuildNumber, 1); // safe default
      });

      test('handles wrong type for min_version gracefully', () {
        final data = {
          'min_version': 123, // Will be converted to String
          'min_build_number': 1,
        };

        final config = AppVersionConfig.fromFirestore(data);
        expect(config.minVersion, '123'); // toString()
      });

      test('handles wrong type for min_build_number gracefully', () {
        final data = {
          'min_version': '1.0.0',
          'min_build_number': '1', // Will be parsed to int
        };

        final config = AppVersionConfig.fromFirestore(data);
        expect(config.minBuildNumber, 1); // parsed from String
      });
    });

    group('toFirestore', () {
      test('converts to Map correctly', () {
        final config = AppVersionConfig(
          minVersion: '1.0.1',
          minBuildNumber: 2,
          forceUpdate: true,
          updateMessage: 'Test message',
          releaseNotes: 'Test notes',
          androidDownloadUrl: 'https://example.com/app.apk',
          iosDownloadUrl: 'https://example.com/app.ipa',
        );

        final map = config.toFirestore();

        expect(map['min_version'], '1.0.1');
        expect(map['min_build_number'], 2);
        expect(map['force_update'], true);
        expect(map['update_message'], 'Test message');
        expect(map['release_notes'], 'Test notes');
        expect(map['android_download_url'], 'https://example.com/app.apk');
        expect(map['ios_download_url'], 'https://example.com/app.ipa');
        expect(map['updated_at'], isNotNull);
      });

      test('omits null URLs', () {
        final config = AppVersionConfig(
          minVersion: '1.0.0',
          minBuildNumber: 1,
          forceUpdate: false,
          updateMessage: 'Test',
        );

        final map = config.toFirestore();

        expect(map.containsKey('android_download_url'), false);
        expect(map.containsKey('ios_download_url'), false);
      });
    });
  });
}
