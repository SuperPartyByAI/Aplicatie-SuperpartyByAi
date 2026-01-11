import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/utils/event_utils.dart';

void main() {
  group('requiresSofer', () {
    test('returns true for exterior locations', () {
      expect(
        requiresSofer(tipEveniment: 'Nunta', tipLocatie: 'Exterior'),
        isTrue,
      );
      expect(
        requiresSofer(tipEveniment: 'Botez', tipLocatie: 'Gradina'),
        isTrue,
      );
      expect(
        requiresSofer(tipEveniment: 'Petrecere', tipLocatie: 'Casa'),
        isTrue,
      );
      expect(
        requiresSofer(tipEveniment: 'Aniversare', tipLocatie: 'Vila'),
        isTrue,
      );
      expect(
        requiresSofer(tipEveniment: 'Corporate', tipLocatie: 'Parc'),
        isTrue,
      );
    });

    test('returns false for interior locations', () {
      expect(
        requiresSofer(tipEveniment: 'Nunta', tipLocatie: 'Sala'),
        isFalse,
      );
      expect(
        requiresSofer(tipEveniment: 'Botez', tipLocatie: 'Restaurant'),
        isFalse,
      );
      expect(
        requiresSofer(tipEveniment: 'Corporate', tipLocatie: 'Hotel'),
        isFalse,
      );
    });

    test('returns false for online events regardless of location', () {
      expect(
        requiresSofer(tipEveniment: 'Online', tipLocatie: 'Exterior'),
        isFalse,
      );
      expect(
        requiresSofer(tipEveniment: 'Virtual', tipLocatie: 'Casa'),
        isFalse,
      );
      expect(
        requiresSofer(tipEveniment: 'Webinar', tipLocatie: 'Gradina'),
        isFalse,
      );
      expect(
        requiresSofer(tipEveniment: 'Online', tipLocatie: 'Sala'),
        isFalse,
      );
    });

    test('handles edge cases', () {
      // Empty strings
      expect(
        requiresSofer(tipEveniment: '', tipLocatie: 'Exterior'),
        isTrue,
      );
      expect(
        requiresSofer(tipEveniment: 'Nunta', tipLocatie: ''),
        isFalse,
      );

      // Unknown types
      expect(
        requiresSofer(tipEveniment: 'Unknown', tipLocatie: 'Unknown'),
        isFalse,
      );

      // Case sensitivity
      expect(
        requiresSofer(tipEveniment: 'Nunta', tipLocatie: 'exterior'),
        isFalse, // Case sensitive - 'exterior' != 'Exterior'
      );
    });

    test('comprehensive location coverage', () {
      final locatiiCuSofer = [
        'Exterior',
        'Casa',
        'Vila',
        'Gradina',
        'Parc',
        'Plaja',
        'Munte'
      ];
      final locatiiFaraSofer = ['Sala', 'Restaurant', 'Hotel', 'Club', 'Bar'];

      for (final locatie in locatiiCuSofer) {
        expect(
          requiresSofer(tipEveniment: 'Nunta', tipLocatie: locatie),
          isTrue,
          reason: 'Locația $locatie ar trebui să necesite șofer',
        );
      }

      for (final locatie in locatiiFaraSofer) {
        expect(
          requiresSofer(tipEveniment: 'Nunta', tipLocatie: locatie),
          isFalse,
          reason: 'Locația $locatie nu ar trebui să necesite șofer',
        );
      }
    });
  });
}
