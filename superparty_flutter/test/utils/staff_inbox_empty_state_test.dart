import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/utils/staff_inbox_empty_state.dart';

void main() {
  group('showRepairCallout', () {
    test('connectedAccounts > 0 and threads == 0 => true', () {
      expect(showRepairCallout(1, 0), isTrue);
      expect(showRepairCallout(3, 0), isTrue);
    });

    test('connectedAccounts == 0 => false (even with 0 threads)', () {
      expect(showRepairCallout(0, 0), isFalse);
    });

    test('threads > 0 => false (even with connected accounts)', () {
      expect(showRepairCallout(1, 1), isFalse);
      expect(showRepairCallout(3, 5), isFalse);
    });

    test('connectedAccounts == 0 and threads > 0 => false', () {
      expect(showRepairCallout(0, 1), isFalse);
    });
  });
}
