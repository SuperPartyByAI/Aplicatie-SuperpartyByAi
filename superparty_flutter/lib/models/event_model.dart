import 'package:cloud_firestore/cloud_firestore.dart';

/// Model pentru eveniment (schema v2)
class EventModel {
  final String id;
  final String date; // DD-MM-YYYY
  final String address;
  final String? cineNoteaza; // cod staff
  final String? sofer; // cod șofer alocat
  final String? soferPending; // cod șofer pending
  final String sarbatoritNume;
  final int sarbatoritVarsta;
  final String? sarbatoritDob; // DD-MM-YYYY
  final IncasareModel incasare;
  final List<RoleModel> roles; // max 10 sloturi A-J
  
  // Arhivare (NEVER DELETE)
  final bool isArchived;
  final DateTime? archivedAt;
  final String? archivedBy;
  final String? archiveReason;
  
  // Audit
  final DateTime createdAt;
  final String createdBy;
  final DateTime updatedAt;
  final String updatedBy;

  EventModel({
    required this.id,
    required this.date,
    required this.address,
    this.cineNoteaza,
    this.sofer,
    this.soferPending,
    required this.sarbatoritNume,
    required this.sarbatoritVarsta,
    this.sarbatoritDob,
    required this.incasare,
    required this.roles,
    this.isArchived = false,
    this.archivedAt,
    this.archivedBy,
    this.archiveReason,
    required this.createdAt,
    required this.createdBy,
    required this.updatedAt,
    required this.updatedBy,
  });

  factory EventModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    // DUAL-READ: suport v1 + v2
    // v2: date (string DD-MM-YYYY), address, roles (array)
    // v1: data (Timestamp), locatie/adresa, alocari (map)
    
    final schemaVersion = data['schemaVersion'] as int? ?? 1;
    
    // Date field (v2: string, v1: Timestamp)
    String dateStr;
    if (data.containsKey('date') && data['date'] is String) {
      // v2: date as string DD-MM-YYYY
      dateStr = data['date'] as String;
    } else if (data.containsKey('date') && data['date'] is Timestamp) {
      // v1: date as Timestamp (old schema) - convert to DD-MM-YYYY
      final timestamp = (data['date'] as Timestamp).toDate();
      dateStr = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
    } else if (data.containsKey('data') && data['data'] is Timestamp) {
      // v1 alternative: data as Timestamp - convert to DD-MM-YYYY
      final timestamp = (data['data'] as Timestamp).toDate();
      dateStr = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
    } else {
      // Fallback: empty date
      dateStr = '';
    }
    
    // Address field (v2: address, v1: locatie or adresa)
    final address = data['address'] as String? ?? 
                    data['locatie'] as String? ?? 
                    data['adresa'] as String? ?? '';
    
    // Roles (v2: array, v1: alocari map)
    List<RoleModel> roles;
    if (data.containsKey('roles') && data['roles'] is List) {
      roles = _parseRoles(data['roles'] as List<dynamic>?);
    } else if (data.containsKey('alocari') && data['alocari'] is Map) {
      // v1: convert alocari map to roles array
      roles = _parseAlocariV1(data['alocari'] as Map<String, dynamic>?);
    } else {
      roles = [];
    }
    
    return EventModel(
      id: doc.id,
      date: dateStr,
      address: address,
      cineNoteaza: data['cineNoteaza'] as String?,
      sofer: data['sofer'] as String?,
      soferPending: data['soferPending'] as String?,
      sarbatoritNume: data['sarbatoritNume'] as String? ?? 
                      data['nume'] as String? ?? '', // v1 fallback
      sarbatoritVarsta: data['sarbatoritVarsta'] as int? ?? 0,
      sarbatoritDob: data['sarbatoritDob'] as String?,
      incasare: IncasareModel.fromMap(data['incasare'] as Map<String, dynamic>?),
      roles: roles,
      isArchived: data['isArchived'] as bool? ?? false,
      archivedAt: (data['archivedAt'] as Timestamp?)?.toDate(),
      archivedBy: data['archivedBy'] as String?,
      archiveReason: data['archiveReason'] as String?,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdBy: data['createdBy'] as String? ?? '',
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedBy: data['updatedBy'] as String? ?? '',
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'schemaVersion': 2, // Mark as v2
      'date': date,
      'address': address,
      if (cineNoteaza != null) 'cineNoteaza': cineNoteaza,
      if (sofer != null) 'sofer': sofer,
      if (soferPending != null) 'soferPending': soferPending,
      'sarbatoritNume': sarbatoritNume,
      'sarbatoritVarsta': sarbatoritVarsta,
      if (sarbatoritDob != null) 'sarbatoritDob': sarbatoritDob,
      'incasare': incasare.toMap(),
      'roles': roles.map((r) => r.toMap()).toList(),
      'isArchived': isArchived,
      if (archivedAt != null) 'archivedAt': Timestamp.fromDate(archivedAt!),
      if (archivedBy != null) 'archivedBy': archivedBy,
      if (archiveReason != null) 'archiveReason': archiveReason,
      'createdAt': Timestamp.fromDate(createdAt),
      'createdBy': createdBy,
      'updatedAt': Timestamp.fromDate(updatedAt),
      'updatedBy': updatedBy,
    };
  }

  static List<RoleModel> _parseRoles(List<dynamic>? data) {
    if (data == null) return [];
    return data
        .map((item) => RoleModel.fromMap(item as Map<String, dynamic>))
        .toList();
  }

  /// Parse alocari v1 (map) to roles v2 (array)
  /// v1: alocari: {animator: 'A1', fotograf: 'B2', ...}
  /// v2: roles: [{slot: 'A', label: 'Animator', assignedCode: 'A1'}, ...]
  static List<RoleModel> _parseAlocariV1(Map<String, dynamic>? alocari) {
    if (alocari == null) return [];
    
    final roles = <RoleModel>[];
    final slotMap = {
      'animator': 'A',
      'ursitoare': 'B',
      'vata': 'C',
      'popcorn': 'D',
      'vata_popcorn': 'E',
      'decoratiuni': 'F',
      'baloane': 'G',
      'baloane_heliu': 'H',
      'aranjamente_masa': 'I',
      'mos_craciun': 'J',
      'gheata_carbonica': 'K',
    };
    
    alocari.forEach((key, value) {
      final slot = slotMap[key] ?? 'A';
      final code = value as String?;
      
      if (code != null && code.isNotEmpty) {
        roles.add(RoleModel(
          slot: slot,
          label: _capitalize(key),
          time: '14:00', // default
          durationMin: 120, // default
          assignedCode: code,
        ));
      }
    });
    
    return roles;
  }

  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  /// Verifică dacă evenimentul necesită șofer
  bool get needsDriver {
    // Necesită șofer dacă:
    // 1. Are rol explicit cu label "SOFER"
    // 2. Are sofer sau soferPending setat
    // 3. Policy: evenimente cu >50 participanți (placeholder)
    
    if (sofer != null && sofer!.isNotEmpty) return true;
    if (soferPending != null && soferPending!.isNotEmpty) return true;
    
    for (var role in roles) {
      if (role.label.toUpperCase().contains('SOFER')) return true;
    }
    
    return false;
  }

  /// Verifică dacă șoferul e alocat
  bool get hasDriverAssigned {
    return sofer != null && sofer!.isNotEmpty;
  }

  /// Verifică dacă șoferul e pending
  bool get hasDriverPending {
    return soferPending != null && soferPending!.isNotEmpty;
  }

  /// Text pentru status șofer
  String get driverStatusText {
    if (!needsDriver) return 'FARA';
    if (hasDriverAssigned) return sofer!;
    if (hasDriverPending) return '...';
    return '!';
  }
}

/// Model pentru rol (slot A-J)
class RoleModel {
  final String slot; // A, B, C, ..., J
  final String label; // ex: "Batman", "Animator"
  final String time; // HH:mm
  final int durationMin;
  final String? assignedCode; // cod staff alocat
  final String? pendingCode; // cod staff pending

  RoleModel({
    required this.slot,
    required this.label,
    required this.time,
    required this.durationMin,
    this.assignedCode,
    this.pendingCode,
  });

  factory RoleModel.fromMap(Map<String, dynamic> map) {
    return RoleModel(
      slot: map['slot'] as String? ?? '',
      label: map['label'] as String? ?? '',
      time: map['time'] as String? ?? '',
      durationMin: map['durationMin'] as int? ?? 0,
      assignedCode: map['assignedCode'] as String?,
      pendingCode: map['pendingCode'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'slot': slot,
      'label': label,
      'time': time,
      'durationMin': durationMin,
      if (assignedCode != null) 'assignedCode': assignedCode,
      if (pendingCode != null) 'pendingCode': pendingCode,
    };
  }

  /// Status vizual pentru UI
  RoleStatus get status {
    if (assignedCode != null && assignedCode!.isNotEmpty) {
      return RoleStatus.assigned;
    }
    if (pendingCode != null && pendingCode!.isNotEmpty) {
      return RoleStatus.pending;
    }
    return RoleStatus.unassigned;
  }
}

enum RoleStatus {
  assigned,   // verde
  pending,    // galben
  unassigned, // gri
}

/// Model pentru încasare
class IncasareModel {
  final String status; // INCASAT / NEINCASAT / ANULAT
  final String? metoda; // CASH / CARD / TRANSFER
  final double? suma;

  IncasareModel({
    required this.status,
    this.metoda,
    this.suma,
  });

  factory IncasareModel.fromMap(Map<String, dynamic>? map) {
    if (map == null) {
      return IncasareModel(status: 'NEINCASAT');
    }
    return IncasareModel(
      status: map['status'] as String? ?? 'NEINCASAT',
      metoda: map['metoda'] as String?,
      suma: (map['suma'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'status': status,
      if (metoda != null) 'metoda': metoda,
      if (suma != null) 'suma': suma,
    };
  }
}
