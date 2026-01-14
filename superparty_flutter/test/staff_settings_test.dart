import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/services/staff_settings_service.dart';

void main() {
  group('Phone normalize/validate', () {
    test('normalize 07xx to +40', () {
      expect(StaffSettingsService.normalizePhone('0722 123 456'), '+40722123456');
    });

    test('normalize 7xxxxxxxx to +40', () {
      expect(StaffSettingsService.normalizePhone('722123456'), '+40722123456');
    });

    test('normalize 0040 to +40', () {
      expect(StaffSettingsService.normalizePhone('0040 722 123 456'), '+40722123456');
    });

    test('validate correct RO phone', () {
      expect(StaffSettingsService.isPhoneValid('0722 123 456'), true);
      expect(StaffSettingsService.isPhoneValid('+40722123456'), true);
    });

    test('reject too short', () {
      expect(StaffSettingsService.isPhoneValid('071'), false);
    });
  });

  group('Assigned code parsing', () {
    test('parseAssignedCode extracts prefix+number', () {
      final p = StaffSettingsService.parseAssignedCode('B210');
      expect(p.prefix, 'B');
      expect(p.number, 210);
    });

    test('parseAssignedCode allows empty prefix', () {
      final p = StaffSettingsService.parseAssignedCode('210');
      expect(p.prefix, '');
      expect(p.number, 210);
    });

    test('parseAssignedCode throws on invalid', () {
      expect(() => StaffSettingsService.parseAssignedCode('B'), throwsFormatException);
      expect(() => StaffSettingsService.parseAssignedCode('B-210'), throwsFormatException);
    });
  });

  group('Code selection helper', () {
    test('selectHighestCode chooses max', () {
      expect(StaffSettingsService.selectHighestCode([101, 104, 103]), 104);
      expect(StaffSettingsService.selectHighestCode([210, 209, 207]), 210);
    });

    test('throws on empty list', () {
      expect(() => StaffSettingsService.selectHighestCode([]), throwsStateError);
    });
  });
}

