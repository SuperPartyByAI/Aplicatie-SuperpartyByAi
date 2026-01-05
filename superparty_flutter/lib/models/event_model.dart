import 'package:cloud_firestore/cloud_firestore.dart';

class EventModel {
  final String id;
  final String nume;
  final String locatie;
  final DateTime data;
  final String tipEveniment;
  final String tipLocatie;
  final bool requiresSofer;
  final Map<String, RoleAssignment> alocari;
  final DriverAssignment sofer;
  final DateTime createdAt;
  final String createdBy;
  final DateTime updatedAt;
  final String updatedBy;
  
  // Câmpuri pentru arhivare (politica: never delete)
  final bool isArchived;
  final DateTime? archivedAt;
  final String? archivedBy;
  final String? archiveReason;

  EventModel({
    required this.id,
    required this.nume,
    required this.locatie,
    required this.data,
    required this.tipEveniment,
    required this.tipLocatie,
    required this.requiresSofer,
    required this.alocari,
    required this.sofer,
    required this.createdAt,
    required this.createdBy,
    required this.updatedAt,
    required this.updatedBy,
    this.isArchived = false,
    this.archivedAt,
    this.archivedBy,
    this.archiveReason,
  });

  factory EventModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return EventModel(
      id: doc.id,
      nume: data['nume'] as String? ?? '',
      locatie: data['locatie'] as String? ?? '',
      data: (data['data'] as Timestamp?)?.toDate() ?? DateTime.now(),
      tipEveniment: data['tipEveniment'] as String? ?? '',
      tipLocatie: data['tipLocatie'] as String? ?? '',
      requiresSofer: data['requiresSofer'] as bool? ?? false,
      alocari: _parseAlocari(data['alocari'] as Map<String, dynamic>?),
      sofer: DriverAssignment.fromMap(data['sofer'] as Map<String, dynamic>?),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdBy: data['createdBy'] as String? ?? '',
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedBy: data['updatedBy'] as String? ?? '',
      isArchived: data['isArchived'] as bool? ?? false,
      archivedAt: (data['archivedAt'] as Timestamp?)?.toDate(),
      archivedBy: data['archivedBy'] as String?,
      archiveReason: data['archiveReason'] as String?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'nume': nume,
      'locatie': locatie,
      'data': Timestamp.fromDate(data),
      'tipEveniment': tipEveniment,
      'tipLocatie': tipLocatie,
      'requiresSofer': requiresSofer,
      'alocari': _alocariToMap(),
      'sofer': sofer.toMap(),
      'createdAt': Timestamp.fromDate(createdAt),
      'createdBy': createdBy,
      'updatedAt': Timestamp.fromDate(updatedAt),
      'updatedBy': updatedBy,
      'isArchived': isArchived,
      if (archivedAt != null) 'archivedAt': Timestamp.fromDate(archivedAt!),
      if (archivedBy != null) 'archivedBy': archivedBy,
      if (archiveReason != null) 'archiveReason': archiveReason,
    };
  }

  static Map<String, RoleAssignment> _parseAlocari(Map<String, dynamic>? data) {
    if (data == null) return {};
    
    return data.map((key, value) {
      return MapEntry(
        key,
        RoleAssignment.fromMap(value as Map<String, dynamic>?),
      );
    });
  }

  Map<String, dynamic> _alocariToMap() {
    return alocari.map((key, value) {
      return MapEntry(key, value.toMap());
    });
  }

  EventModel copyWith({
    String? id,
    String? nume,
    String? locatie,
    DateTime? data,
    String? tipEveniment,
    String? tipLocatie,
    bool? requiresSofer,
    Map<String, RoleAssignment>? alocari,
    DriverAssignment? sofer,
    DateTime? createdAt,
    String? createdBy,
    DateTime? updatedAt,
    String? updatedBy,
  }) {
    return EventModel(
      id: id ?? this.id,
      nume: nume ?? this.nume,
      locatie: locatie ?? this.locatie,
      data: data ?? this.data,
      tipEveniment: tipEveniment ?? this.tipEveniment,
      tipLocatie: tipLocatie ?? this.tipLocatie,
      requiresSofer: requiresSofer ?? this.requiresSofer,
      alocari: alocari ?? this.alocari,
      sofer: sofer ?? this.sofer,
      createdAt: createdAt ?? this.createdAt,
      createdBy: createdBy ?? this.createdBy,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
    );
  }
}

class RoleAssignment {
  final String? userId;
  final AssignmentStatus status;

  RoleAssignment({
    this.userId,
    required this.status,
  });

  factory RoleAssignment.fromMap(Map<String, dynamic>? data) {
    if (data == null) {
      return RoleAssignment(status: AssignmentStatus.unassigned);
    }
    
    return RoleAssignment(
      userId: data['userId'] as String?,
      status: AssignmentStatus.fromString(data['status'] as String?),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'status': status.value,
    };
  }

  RoleAssignment copyWith({
    String? userId,
    AssignmentStatus? status,
  }) {
    return RoleAssignment(
      userId: userId ?? this.userId,
      status: status ?? this.status,
    );
  }
}

enum AssignmentStatus {
  unassigned('unassigned'),
  assigned('assigned');

  final String value;
  const AssignmentStatus(this.value);

  static AssignmentStatus fromString(String? value) {
    switch (value) {
      case 'assigned':
        return AssignmentStatus.assigned;
      default:
        return AssignmentStatus.unassigned;
    }
  }
}

class DriverAssignment {
  final bool required;
  final String? userId;
  final DriverStatus status;

  DriverAssignment({
    required this.required,
    this.userId,
    required this.status,
  });

  factory DriverAssignment.fromMap(Map<String, dynamic>? data) {
    if (data == null) {
      return DriverAssignment(
        required: false,
        status: DriverStatus.notRequired,
      );
    }
    
    return DriverAssignment(
      required: data['required'] as bool? ?? false,
      userId: data['userId'] as String?,
      status: DriverStatus.fromString(data['status'] as String?),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'required': required,
      'userId': userId,
      'status': status.value,
    };
  }

  DriverAssignment copyWith({
    bool? required,
    String? userId,
    DriverStatus? status,
  }) {
    return DriverAssignment(
      required: required ?? this.required,
      userId: userId ?? this.userId,
      status: status ?? this.status,
    );
  }
}

enum DriverStatus {
  notRequired('not_required'),
  unassigned('unassigned'),
  assigned('assigned');

  final String value;
  const DriverStatus(this.value);

  static DriverStatus fromString(String? value) {
    switch (value) {
      case 'unassigned':
        return DriverStatus.unassigned;
      case 'assigned':
        return DriverStatus.assigned;
      default:
        return DriverStatus.notRequired;
    }
  }
}
