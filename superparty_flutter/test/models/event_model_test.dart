import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:superparty_app/models/event_model.dart';

void main() {
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
}

// Create a real DocumentSnapshot using fake_cloud_firestore
Future<DocumentSnapshot> _createMockDoc(Map<String, dynamic> data) async {
  final fakeFirestore = FakeFirebaseFirestore();
  await fakeFirestore.collection('evenimente').doc('test-id').set(data);
  return await fakeFirestore.collection('evenimente').doc('test-id').get();
}
