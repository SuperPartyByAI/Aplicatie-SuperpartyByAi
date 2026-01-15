import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:superparty_app/models/event_model.dart';

void main() {
  group('EventModel Dual-Read (v1/v2)', () {
    test('should parse v2 schema (date string)', () {
      final doc = _createMockDoc({
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

      final event = EventModel.fromFirestore(doc as DocumentSnapshot);

      expect(event.date, '2026-01-15');
      expect(event.address, 'București, Str. Test 1');
      expect(event.sarbatoritNume, 'Maria');
    });

    test('should parse v1 schema (data Timestamp, locatie)', () {
      final testDate = DateTime(2026, 1, 15);
      final doc = _createMockDoc({
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

      final event = EventModel.fromFirestore(doc as DocumentSnapshot);

      expect(event.date, '2026-01-15');
      expect(event.address, 'București, Str. Test 1');
      expect(event.sarbatoritNume, 'Maria');
      expect(event.roles.length, 2);
      expect(event.roles[0].slot, 'A');
      expect(event.roles[0].assignedCode, 'A1');
    });

    test('should handle missing optional fields', () {
      final doc = _createMockDoc({
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

      final event = EventModel.fromFirestore(doc as DocumentSnapshot);

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

// Mock DocumentSnapshot (using composition instead of implementation to avoid sealed class issue)
_MockDocumentSnapshot _createMockDoc(Map<String, dynamic> data) {
  return _MockDocumentSnapshot('test-id', data);
}

class _MockDocumentSnapshot {
  final String id;
  final Map<String, dynamic> _data;

  _MockDocumentSnapshot(this.id, this._data);

  Map<String, dynamic>? data() => _data;
  
  // Make it compatible with EventModel.fromFirestore which expects DocumentSnapshot-like interface
  // Note: We can't implement DocumentSnapshot because it's sealed, but EventModel only uses .id and .data()
}
