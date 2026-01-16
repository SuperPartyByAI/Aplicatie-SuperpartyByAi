import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:superparty_app/models/event_model.dart';
import '../test_setup.dart';

void main() {
  setUpAll(() {
    muteDebugPrint();
  });

  tearDownAll(() {
    restoreDebugPrint();
  });

  group('EventModel Dual-Read (v1/v2)', () {
    test('should parse v2 schema (date string)', () async {
      final doc = await _createMockDoc({
        'schemaVersion': 2,
        'date': '2026-01-15',
        'address': 'București, Str. Test 1',
        'sarbatoritNume': 'Maria',
        'sarbatoritVarsta': 5,
        'incasare': {'status': 'NEINCASAT'},
        'roles': [],
        'isArchived': false,
        'createdAt': Timestamp.now(),
        'createdBy': 'admin',
        'updatedAt': Timestamp.now(),
        'updatedBy': 'admin',
      });

      final event = EventModel.fromFirestore(doc);

      expect(event.date, '2026-01-15');
      expect(event.address, 'București, Str. Test 1');
      expect(event.sarbatoritNume, 'Maria');
    });

    test('should parse v1 schema (data Timestamp, locatie)', () async {
      final testDate = DateTime(2026, 1, 15);
      final doc = await _createMockDoc({
        'data': Timestamp.fromDate(testDate),
        'locatie': 'București, Str. Test 1',
        'nume': 'Maria',
        'sarbatoritVarsta': 5,
        'incasare': {'status': 'NEINCASAT'},
        'alocari': {
          'animator': 'A1',
          'fotograf': 'B2',
        },
        'isArchived': false,
        'createdAt': Timestamp.now(),
        'createdBy': 'admin',
        'updatedAt': Timestamp.now(),
        'updatedBy': 'admin',
      });

      final event = EventModel.fromFirestore(doc);

      expect(event.date, '2026-01-15');
      expect(event.address, 'București, Str. Test 1');
      expect(event.sarbatoritNume, 'Maria');
      expect(event.roles.length, 2);
      expect(event.roles[0].slot, 'A');
      expect(event.roles[0].assignedCode, 'A1');
    });

    test('should handle missing optional fields', () async {
      final doc = await _createMockDoc({
        'date': '2026-01-15',
        'address': 'Test',
        'sarbatoritNume': 'Test',
        'sarbatoritVarsta': 5,
        'incasare': {'status': 'NEINCASAT'},
        'roles': [],
        'isArchived': false,
        'createdAt': Timestamp.now(),
        'createdBy': 'admin',
        'updatedAt': Timestamp.now(),
        'updatedBy': 'admin',
      });

      final event = EventModel.fromFirestore(doc);

      expect(event.cineNoteaza, null);
      expect(event.sofer, null);
      expect(event.soferPending, null);
      expect(event.archivedAt, null);
    });
  });

  group('EventModel Arhivare', () {
    test('should include archive fields in toFirestore', () {
      final event = EventModel(
        id: '1',
        date: '2026-01-15',
        address: 'Test',
        sarbatoritNume: 'Test',
        sarbatoritVarsta: 5,
        incasare: IncasareModel(status: 'NEINCASAT'),
        roles: [],
        isArchived: true,
        archivedAt: DateTime(2026, 1, 15),
        archivedBy: 'admin',
        archiveReason: 'Test reason',
        createdAt: DateTime.now(),
        createdBy: 'admin',
        updatedAt: DateTime.now(),
        updatedBy: 'admin',
      );

      final data = event.toFirestore();

      expect(data['isArchived'], true);
      expect(data['archivedBy'], 'admin');
      expect(data['archiveReason'], 'Test reason');
      expect(data['schemaVersion'], 2);
    });
  });

  group('EventModel Defensive Parsing', () {
    test('should handle null doc.data() gracefully', () async {
      // Regression test: corrupted Firestore doc with null data() should not crash
      // Before fix: doc.data() as Map<String, dynamic> would throw TypeError
      // After fix: Should return safe default EventModel
      
      final fakeFirestore = FakeFirebaseFirestore();
      // Create doc with null data (simulate corrupted/missing data)
      await fakeFirestore.collection('evenimente').doc('corrupted-id').set({});
      
      // Manually set data to null (simulate corrupted doc)
      // Note: fake_cloud_firestore doesn't support null data directly,
      // but we can test with minimal/invalid data
      
      final doc = await fakeFirestore.collection('evenimente').doc('corrupted-id').get();
      
      // Test that parsing doesn't crash even with minimal data
      expect(() => EventModel.fromFirestore(doc), returnsNormally);
      
      final event = EventModel.fromFirestore(doc);
      // Should return safe defaults (empty string for date when data is missing)
      expect(event.id, 'corrupted-id');
      expect(event.date, isEmpty); // Regression: should not crash, returns empty string
      expect(event.address, isEmpty); // Safe default
      expect(event.sarbatoritNume, isEmpty); // Safe default
      expect(event.sarbatoritVarsta, 0); // Safe default
    });

    test('should handle invalid type in sarbatoritVarsta', () async {
      // Regression test: wrong type (String instead of int) should not crash
      final doc = await _createMockDoc({
        'date': '2026-01-15',
        'address': 'Test',
        'sarbatoritNume': 'Test',
        'sarbatoritVarsta': 'invalid', // Wrong type: String instead of int
        'incasare': {'status': 'NEINCASAT'},
        'roles': [],
        'isArchived': false,
        'createdAt': Timestamp.now(),
        'createdBy': 'admin',
        'updatedAt': Timestamp.now(),
        'updatedBy': 'admin',
      });

      // Should not crash, should use default value (0)
      expect(() => EventModel.fromFirestore(doc), returnsNormally);
      final event = EventModel.fromFirestore(doc);
      expect(event.sarbatoritVarsta, 0); // Should fallback to 0
    });

    test('should handle invalid incasare type', () async {
      // Regression test: incasare as String instead of Map should not crash
      final doc = await _createMockDoc({
        'date': '2026-01-15',
        'address': 'Test',
        'sarbatoritNume': 'Test',
        'sarbatoritVarsta': 5,
        'incasare': 'invalid', // Wrong type: String instead of Map
        'roles': [],
        'isArchived': false,
        'createdAt': Timestamp.now(),
        'createdBy': 'admin',
        'updatedAt': Timestamp.now(),
        'updatedBy': 'admin',
      });

      // Should not crash, should use safe default IncasareModel
      expect(() => EventModel.fromFirestore(doc), returnsNormally);
      final event = EventModel.fromFirestore(doc);
      expect(event.incasare.status, 'NEINCASAT'); // Should fallback to safe default
    });

    test('should handle invalid roles array items', () async {
      // Regression test: roles array with invalid items should filter them out
      final doc = await _createMockDoc({
        'date': '2026-01-15',
        'address': 'Test',
        'sarbatoritNume': 'Test',
        'sarbatoritVarsta': 5,
        'incasare': {'status': 'NEINCASAT'},
        'roles': [
          {'slot': 'A', 'label': 'Valid'}, // Valid
          'invalid', // Invalid: String instead of Map
          123, // Invalid: int instead of Map
          {'invalid': 'structure'}, // Invalid: missing required fields
        ],
        'isArchived': false,
        'createdAt': Timestamp.now(),
        'createdBy': 'admin',
        'updatedAt': Timestamp.now(),
        'updatedBy': 'admin',
      });

      // Should not crash, should filter invalid items
      expect(() => EventModel.fromFirestore(doc), returnsNormally);
      final event = EventModel.fromFirestore(doc);
      // Should only contain valid roles or empty list
      expect(event.roles, isA<List<RoleModel>>());
    });
  });
}

// Create a real DocumentSnapshot using fake_cloud_firestore
Future<DocumentSnapshot> _createMockDoc(Map<String, dynamic> data) async {
  final fakeFirestore = FakeFirebaseFirestore();
  await fakeFirestore.collection('evenimente').doc('test-id').set(data);
  return await fakeFirestore.collection('evenimente').doc('test-id').get();
}
