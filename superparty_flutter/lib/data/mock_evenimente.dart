import '../models/event_model.dart';
import '../models/evidence_model.dart';
import '../models/evidence_state_model.dart';

/// Mock data pentru UI Preview (8-10 evenimente + dovezi)
class MockEvenimente {
  static final List<EventModel> evenimente = [
    // 1. Eveniment trecut, complet alocat, incasat
    EventModel(
      id: '01',
      date: '2026-01-03',
      address: 'București, Sector 3, Str. Florilor 12',
      cineNoteaza: 'A1',
      sofer: 'D1',
      soferPending: null,
      sarbatoritNume: 'Maria',
      sarbatoritVarsta: 5,
      sarbatoritDob: '2021-01-15',
      incasare: IncasareModel(status: 'INCASAT', metoda: 'CASH', suma: 490),
      roles: [
        RoleModel(slot: 'A', label: 'Batman', time: '14:00', durationMin: 120, assignedCode: 'A3'),
        RoleModel(slot: 'B', label: 'Fotograf', time: '14:00', durationMin: 120, assignedCode: 'B2'),
      ],
      createdAt: DateTime(2026, 1, 1),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 3),
      updatedBy: 'admin',
    ),

    // 2. Eveniment azi, pending roles, neincasat
    EventModel(
      id: '02',
      date: '2026-01-05',
      address: 'Cluj-Napoca, Str. Memorandumului 28',
      cineNoteaza: 'B1',
      sofer: null,
      soferPending: 'D2',
      sarbatoritNume: 'Andrei',
      sarbatoritVarsta: 7,
      sarbatoritDob: '2019-01-05',
      incasare: IncasareModel(status: 'NEINCASAT'),
      roles: [
        RoleModel(slot: 'A', label: 'Animator', time: '15:00', durationMin: 90, assignedCode: null, pendingCode: 'A5'),
        RoleModel(slot: 'B', label: 'DJ', time: '15:00', durationMin: 90, assignedCode: 'B1'),
        RoleModel(slot: 'C', label: 'Barman', time: '15:00', durationMin: 90, assignedCode: null),
      ],
      createdAt: DateTime(2026, 1, 2),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 5),
      updatedBy: 'admin',
    ),

    // 3. Eveniment viitor, fără șofer, nealocat
    EventModel(
      id: '03',
      date: '2026-01-08',
      address: 'Timișoara, Bd. Revoluției 5',
      cineNoteaza: 'C1',
      sofer: null,
      soferPending: null,
      sarbatoritNume: 'Elena',
      sarbatoritVarsta: 4,
      sarbatoritDob: '2022-01-08',
      incasare: IncasareModel(status: 'NEINCASAT'),
      roles: [
        RoleModel(slot: 'A', label: 'Prinț', time: '16:00', durationMin: 120, assignedCode: null),
        RoleModel(slot: 'B', label: 'Fotograf', time: '16:00', durationMin: 120, assignedCode: null),
      ],
      createdAt: DateTime(2026, 1, 4),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 4),
      updatedBy: 'admin',
    ),

    // 4. Eveniment viitor, necesită șofer nealocat
    EventModel(
      id: '04',
      date: '2026-01-10',
      address: 'Brașov, Str. Republicii 45',
      cineNoteaza: 'A2',
      sofer: null,
      soferPending: null,
      sarbatoritNume: 'David',
      sarbatoritVarsta: 6,
      sarbatoritDob: '2020-01-10',
      incasare: IncasareModel(status: 'NEINCASAT'),
      roles: [
        RoleModel(slot: 'A', label: 'Spiderman', time: '14:30', durationMin: 120, assignedCode: 'A1'),
        RoleModel(slot: 'D', label: 'SOFER', time: '13:00', durationMin: 180, assignedCode: null),
      ],
      createdAt: DateTime(2026, 1, 5),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 5),
      updatedBy: 'admin',
    ),

    // 5. Eveniment viitor, șofer alocat
    EventModel(
      id: '05',
      date: '2026-01-12',
      address: 'Iași, Str. Lăpușneanu 12',
      cineNoteaza: 'B2',
      sofer: 'D3',
      soferPending: null,
      sarbatoritNume: 'Sofia',
      sarbatoritVarsta: 8,
      sarbatoritDob: '2018-01-12',
      incasare: IncasareModel(status: 'INCASAT', metoda: 'CARD', suma: 650),
      roles: [
        RoleModel(slot: 'A', label: 'Elsa', time: '15:00', durationMin: 120, assignedCode: 'A4'),
        RoleModel(slot: 'B', label: 'Anna', time: '15:00', durationMin: 120, assignedCode: 'B3'),
        RoleModel(slot: 'C', label: 'Fotograf', time: '15:00', durationMin: 120, assignedCode: 'C1'),
      ],
      createdAt: DateTime(2026, 1, 6),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 6),
      updatedBy: 'admin',
    ),

    // 6. Eveniment anulat
    EventModel(
      id: '06',
      date: '2026-01-15',
      address: 'Constanța, Bd. Mamaia 100',
      cineNoteaza: null,
      sofer: null,
      soferPending: null,
      sarbatoritNume: 'Alex',
      sarbatoritVarsta: 5,
      sarbatoritDob: '2021-01-15',
      incasare: IncasareModel(status: 'ANULAT'),
      roles: [],
      createdAt: DateTime(2026, 1, 7),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 8),
      updatedBy: 'admin',
    ),

    // 7. Eveniment viitor, multe roluri
    EventModel(
      id: '07',
      date: '2026-01-20',
      address: 'Sibiu, Piața Mare 1',
      cineNoteaza: 'A3',
      sofer: 'D1',
      soferPending: null,
      sarbatoritNume: 'Luca',
      sarbatoritVarsta: 10,
      sarbatoritDob: '2016-01-20',
      incasare: IncasareModel(status: 'NEINCASAT'),
      roles: [
        RoleModel(slot: 'A', label: 'Batman', time: '16:00', durationMin: 150, assignedCode: 'A1'),
        RoleModel(slot: 'B', label: 'Superman', time: '16:00', durationMin: 150, assignedCode: 'B1'),
        RoleModel(slot: 'C', label: 'Spiderman', time: '16:00', durationMin: 150, assignedCode: null, pendingCode: 'C2'),
        RoleModel(slot: 'D', label: 'DJ', time: '16:00', durationMin: 150, assignedCode: 'D5'),
        RoleModel(slot: 'E', label: 'Fotograf', time: '16:00', durationMin: 150, assignedCode: 'E1'),
      ],
      createdAt: DateTime(2026, 1, 8),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 8),
      updatedBy: 'admin',
    ),

    // 8. Eveniment viitor, fără roluri (doar șofer)
    EventModel(
      id: '08',
      date: '2026-01-25',
      address: 'Oradea, Str. Republicii 22',
      cineNoteaza: 'D1',
      sofer: 'D2',
      soferPending: null,
      sarbatoritNume: 'Emma',
      sarbatoritVarsta: 3,
      sarbatoritDob: '2023-01-25',
      incasare: IncasareModel(status: 'NEINCASAT'),
      roles: [],
      createdAt: DateTime(2026, 1, 9),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 9),
      updatedBy: 'admin',
    ),

    // 9. Eveniment trecut, neincasat (problematic)
    EventModel(
      id: '09',
      date: '2026-01-02',
      address: 'Galați, Str. Domnească 8',
      cineNoteaza: 'A5',
      sofer: null,
      soferPending: null,
      sarbatoritNume: 'Radu',
      sarbatoritVarsta: 6,
      sarbatoritDob: '2020-01-02',
      incasare: IncasareModel(status: 'NEINCASAT'),
      roles: [
        RoleModel(slot: 'A', label: 'Animator', time: '14:00', durationMin: 120, assignedCode: 'A5'),
      ],
      createdAt: DateTime(2026, 1, 1),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 2),
      updatedBy: 'admin',
    ),

    // 10. Eveniment viitor, pending multiple
    EventModel(
      id: '10',
      date: '2026-02-01',
      address: 'Ploiești, Bd. Independenței 15',
      cineNoteaza: null,
      sofer: null,
      soferPending: 'D4',
      sarbatoritNume: 'Ioana',
      sarbatoritVarsta: 7,
      sarbatoritDob: '2019-02-01',
      incasare: IncasareModel(status: 'NEINCASAT'),
      roles: [
        RoleModel(slot: 'A', label: 'Prinț', time: '15:00', durationMin: 120, assignedCode: null, pendingCode: 'A2'),
        RoleModel(slot: 'B', label: 'Prințesă', time: '15:00', durationMin: 120, assignedCode: null, pendingCode: 'B4'),
        RoleModel(slot: 'C', label: 'Fotograf', time: '15:00', durationMin: 120, assignedCode: null, pendingCode: 'C3'),
      ],
      createdAt: DateTime(2026, 1, 10),
      createdBy: 'admin',
      updatedAt: DateTime(2026, 1, 10),
      updatedBy: 'admin',
    ),
  ];

  /// Mock dovezi pentru eveniment (toate stările)
  static Map<String, List<MockEvidence>> dovezi = {
    '01': [
      MockEvidence(category: EvidenceCategory.onTime, fileName: 'ontime_1.jpg', status: EvidenceStatus.ok, locked: true),
      MockEvidence(category: EvidenceCategory.luggage, fileName: 'luggage_1.jpg', status: EvidenceStatus.ok, locked: true),
      MockEvidence(category: EvidenceCategory.luggage, fileName: 'luggage_2.jpg', status: EvidenceStatus.ok, locked: true),
      MockEvidence(category: EvidenceCategory.accessories, fileName: 'acc_1.jpg', status: EvidenceStatus.verifying, locked: false),
      MockEvidence(category: EvidenceCategory.laundry, fileName: 'laundry_1.jpg', status: EvidenceStatus.needed, locked: false),
    ],
    '02': [
      MockEvidence(category: EvidenceCategory.onTime, fileName: 'ontime_1.jpg', status: EvidenceStatus.verifying, locked: false),
      MockEvidence(category: EvidenceCategory.luggage, fileName: 'luggage_1.jpg', status: EvidenceStatus.needed, locked: false),
    ],
    '03': [], // Fără dovezi
    '05': [
      MockEvidence(category: EvidenceCategory.onTime, fileName: 'ontime_1.jpg', status: EvidenceStatus.ok, locked: true),
      MockEvidence(category: EvidenceCategory.onTime, fileName: 'ontime_2.jpg', status: EvidenceStatus.ok, locked: true),
      MockEvidence(category: EvidenceCategory.luggage, fileName: 'luggage_1.jpg', status: EvidenceStatus.ok, locked: true),
      MockEvidence(category: EvidenceCategory.accessories, fileName: 'acc_1.jpg', status: EvidenceStatus.ok, locked: true),
      MockEvidence(category: EvidenceCategory.laundry, fileName: 'laundry_1.jpg', status: EvidenceStatus.ok, locked: true),
    ],
  };

  /// Status categorii pentru evenimente
  static Map<String, Map<EvidenceCategory, EvidenceStateModel>> evidenceStates = {
    '01': {
      EvidenceCategory.onTime: EvidenceStateModel(
        id: 'onTime',
        category: EvidenceCategory.onTime,
        status: EvidenceStatus.ok,
        locked: true,
        updatedAt: DateTime(2026, 1, 3),
        updatedBy: 'A3',
      ),
      EvidenceCategory.luggage: EvidenceStateModel(
        id: 'luggage',
        category: EvidenceCategory.luggage,
        status: EvidenceStatus.ok,
        locked: true,
        updatedAt: DateTime(2026, 1, 3),
        updatedBy: 'A3',
      ),
      EvidenceCategory.accessories: EvidenceStateModel(
        id: 'accessories',
        category: EvidenceCategory.accessories,
        status: EvidenceStatus.verifying,
        locked: false,
        updatedAt: DateTime(2026, 1, 3),
        updatedBy: 'A3',
      ),
      EvidenceCategory.laundry: EvidenceStateModel(
        id: 'laundry',
        category: EvidenceCategory.laundry,
        status: EvidenceStatus.needed,
        locked: false,
        updatedAt: DateTime(2026, 1, 3),
        updatedBy: 'A3',
      ),
    },
    '02': {
      EvidenceCategory.onTime: EvidenceStateModel(
        id: 'onTime',
        category: EvidenceCategory.onTime,
        status: EvidenceStatus.verifying,
        locked: false,
        updatedAt: DateTime(2026, 1, 5),
        updatedBy: 'B1',
      ),
      EvidenceCategory.luggage: EvidenceStateModel(
        id: 'luggage',
        category: EvidenceCategory.luggage,
        status: EvidenceStatus.needed,
        locked: false,
        updatedAt: DateTime(2026, 1, 5),
        updatedBy: 'B1',
      ),
      EvidenceCategory.accessories: EvidenceStateModel(
        id: 'accessories',
        category: EvidenceCategory.accessories,
        status: EvidenceStatus.na,
        locked: false,
        updatedAt: DateTime(2026, 1, 5),
        updatedBy: 'B1',
      ),
      EvidenceCategory.laundry: EvidenceStateModel(
        id: 'laundry',
        category: EvidenceCategory.laundry,
        status: EvidenceStatus.na,
        locked: false,
        updatedAt: DateTime(2026, 1, 5),
        updatedBy: 'B1',
      ),
    },
    '05': {
      EvidenceCategory.onTime: EvidenceStateModel(
        id: 'onTime',
        category: EvidenceCategory.onTime,
        status: EvidenceStatus.ok,
        locked: true,
        updatedAt: DateTime(2026, 1, 12),
        updatedBy: 'B2',
      ),
      EvidenceCategory.luggage: EvidenceStateModel(
        id: 'luggage',
        category: EvidenceCategory.luggage,
        status: EvidenceStatus.ok,
        locked: true,
        updatedAt: DateTime(2026, 1, 12),
        updatedBy: 'B2',
      ),
      EvidenceCategory.accessories: EvidenceStateModel(
        id: 'accessories',
        category: EvidenceCategory.accessories,
        status: EvidenceStatus.ok,
        locked: true,
        updatedAt: DateTime(2026, 1, 12),
        updatedBy: 'B2',
      ),
      EvidenceCategory.laundry: EvidenceStateModel(
        id: 'laundry',
        category: EvidenceCategory.laundry,
        status: EvidenceStatus.ok,
        locked: true,
        updatedAt: DateTime(2026, 1, 12),
        updatedBy: 'B2',
      ),
    },
  };
}

/// Mock evidence pentru preview
class MockEvidence {
  final EvidenceCategory category;
  final String fileName;
  final EvidenceStatus status;
  final bool locked;

  MockEvidence({
    required this.category,
    required this.fileName,
    required this.status,
    required this.locked,
  });
}
