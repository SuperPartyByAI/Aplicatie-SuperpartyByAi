import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:superparty_app/services/force_update_checker_service.dart';

void main() {
  group('ForceUpdateCheckerService', () {
    late FakeFirebaseFirestore fakeFirestore;
    late ForceUpdateCheckerService service;

    setUp(() {
      fakeFirestore = FakeFirebaseFirestore();
      service = ForceUpdateCheckerService(firestore: fakeFirestore);
    });

    group('getVersionConfig', () {
      test('returns default config when document does not exist', () async {
        final config = await service.getVersionConfig();
        expect(config, isNotNull); // Returns safe default
        expect(config.minVersion, '0.0.0'); // safeDefault()
        expect(config.minBuildNumber, 0); // safeDefault()
      });

      test('returns config when document exists', () async {
        await fakeFirestore.collection('app_config').doc('version').set({
          'min_version': '1.0.1',
          'min_build_number': 2,
          'force_update': true,
          'update_message': 'Test message',
        });

        final config = await service.getVersionConfig();

        expect(config, isNotNull);
        expect(config.minVersion, '1.0.1');
        expect(config.minBuildNumber, 2);
        expect(config.forceUpdate, true);
      });

      test('returns default config when parsing fails', () async {
        // Invalid data (missing required fields)
        await fakeFirestore.collection('app_config').doc('version').set({
          'invalid_field': 'value',
        });

        final config = await service.getVersionConfig();
        expect(config, isNotNull); // Returns safe default
      });
    });

    group('needsForceUpdate', () {
      test('returns false when config does not exist', () async {
        final needsUpdate = await service.needsForceUpdate();
        expect(needsUpdate, false);
      });

      test('returns false when force_update is disabled', () async {
        await fakeFirestore.collection('app_config').doc('version').set({
          'min_version': '1.0.1',
          'min_build_number': 999, // Higher than any current build
          'force_update': false, // Disabled
        });

        final needsUpdate = await service.needsForceUpdate();
        expect(needsUpdate, false);
      });

      // Note: Testing actual build number comparison requires mocking PackageInfo
      // which is complex in unit tests. This would be better tested in integration tests.
    });

    group('getDownloadUrl', () {
      test('returns null when config does not exist', () async {
        final url = await service.getDownloadUrl();
        // Service returns default config, but URL fields are null
        expect(url, isNull);
      });

      // Note: Testing platform-specific URLs requires mocking Platform.isAndroid/isIOS
      // which is complex in unit tests. This would be better tested in integration tests.
    });

    group('getUpdateMessage', () {
      test('returns default message when config does not exist', () async {
        final message = await service.getUpdateMessage();
        expect(message, contains('versiune nouă'));
      });

      test('returns custom message from config', () async {
        await fakeFirestore.collection('app_config').doc('version').set({
          'min_version': '1.0.1',
          'min_build_number': 2,
          'update_message': 'Custom update message',
        });

        final message = await service.getUpdateMessage();
        expect(message, 'Custom update message');
      });
    });

    group('getReleaseNotes', () {
      test('returns empty string when config does not exist', () async {
        final notes = await service.getReleaseNotes();
        expect(notes, '');
      });

      test('returns release notes from config', () async {
        await fakeFirestore.collection('app_config').doc('version').set({
          'min_version': '1.0.1',
          'min_build_number': 2,
          'release_notes': '- Bug fixes\n- New features',
        });

        final notes = await service.getReleaseNotes();
        expect(notes, '- Bug fixes\n- New features');
      });
    });
  });
}
