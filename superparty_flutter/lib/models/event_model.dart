import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Model pentru eveniment (schema v2)
class EventModel {
  final String id;
  final int schemaVersion;
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
    this.schemaVersion = 0,
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
    final raw = doc.data();
    if (raw is! Map<String, dynamic>) {
      debugPrint(
        '[EventModel] ⚠️ Invalid doc.data() for ${doc.id}: ${raw.runtimeType}. Marking archived.',
      );
      final now = DateTime.now();
      return EventModel(
        id: doc.id,
        schemaVersion: 0,
        date: '',
        address: '',
        sarbatoritNume: '',
        sarbatoritVarsta: 0,
        incasare: IncasareModel(status: 'NEINCASAT'),
        roles: const [],
        isArchived: true,
        createdAt: now,
        createdBy: '',
        updatedAt: now,
        updatedBy: '',
      );
    }

    final data = raw;

    final schemaVersionRaw = data['schemaVersion'];
    final schemaVersion = switch (schemaVersionRaw) {
      int v => v,
      num v => v.toInt(),
      String v => int.tryParse(v.trim()) ?? 0,
      _ => 0,
    };
    
    // DEBUG: Log raw data to see what we're receiving
    debugPrint('[EventModel] Parsing event ${doc.id}');
    debugPrint('[EventModel] Raw data keys: ${data.keys.toList()}');
    debugPrint('[EventModel] date field: ${data['date']} (type: ${data['date']?.runtimeType})');
    debugPrint('[EventModel] data field: ${data['data']} (type: ${data['data']?.runtimeType})');
    
    // DUAL-READ: suport v1 + v2
    // v2: date (string DD-MM-YYYY), address, roles (array)
    // v1: data (Timestamp), locatie/adresa, alocari (map)
    
    // schemaVersion is currently informational; parsing left intentionally best-effort.
    
    // Date field (v3/v2: string, v1: Timestamp)
    // Support both 'date' (English) and 'data' (Romanian) field names
    String dateStr;
    if (data.containsKey('date') && data['date'] is String) {
      // v2: date as string DD-MM-YYYY (English field name)
      dateStr = _normalizeDateString(data['date'] as String);
      debugPrint('[EventModel] ✅ Using date as String: $dateStr');
    } else if (data.containsKey('data') && data['data'] is String) {
      // v2: data as string DD-MM-YYYY (Romanian field name)
      dateStr = _normalizeDateString(data['data'] as String);
      debugPrint('[EventModel] ✅ Using data as String: $dateStr');
    } else if (data.containsKey('date') && data['date'] is Timestamp) {
      // v1: date as Timestamp (old schema) - convert to DD-MM-YYYY
      final timestamp = (data['date'] as Timestamp).toDate();
      dateStr = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
      debugPrint('[EventModel] ✅ Converted date Timestamp to String: $dateStr');
    } else if (data.containsKey('data') && data['data'] is Timestamp) {
      // v1 alternative: data as Timestamp - convert to DD-MM-YYYY
      final timestamp = (data['data'] as Timestamp).toDate();
      dateStr = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
      debugPrint('[EventModel] ✅ Converted data Timestamp to String: $dateStr');
    } else {
      // Fallback: empty date
      dateStr = '';
      debugPrint('[EventModel] ⚠️ No valid date field found, using empty string');
    }
    
    // Address field (v2: address, v1: locatie or adresa)
    final address = data['address'] as String? ?? 
                    data['locatie'] as String? ?? 
                    data['adresa'] as String? ?? '';
    
    // Roles
    // Priority: rolesBySlot (v3) > roluriPeSlot (RO) > roles[] > roluri[] > alocari (v1 map)
    List<RoleModel> roles;
    final rolesBySlotRaw = data['rolesBySlot'] ?? data['roluriPeSlot'];
    if (rolesBySlotRaw is Map) {
      roles = _parseRolesBySlot(rolesBySlotRaw);
    } else if (data.containsKey('roles') && data['roles'] is List) {
      roles = _parseRoles(data['roles']);
    } else if (data.containsKey('roluri') && data['roluri'] is List) {
      roles = _parseRoles(data['roluri']);
    } else if (data.containsKey('alocari') && data['alocari'] is Map) {
      roles = _parseAlocariV1(data['alocari'] as Map<String, dynamic>?);
    } else {
      roles = [];
    }

    final childName =
        data['childName'] as String? ?? data['sarbatoritNume'] as String? ?? data['nume'] as String? ?? '';
    final childAgeRaw = data['childAge'] ?? data['sarbatoritVarsta'];
    final childAge = switch (childAgeRaw) {
      int v => v,
      num v => v.toInt(),
      String v => int.tryParse(v.trim()) ?? 0,
      _ => 0,
    };

    final childDob =
        data['childDob'] as String? ?? data['sarbatoritDob'] as String?;

    final incasareMap = data['incasare'];
    final paymentMap = data['payment'];
    final incasare = incasareMap is Map<String, dynamic>
        ? IncasareModel.fromMap(incasareMap)
        : (paymentMap is Map
            ? IncasareModel.fromPaymentMap(Map<String, dynamic>.from(paymentMap))
            : IncasareModel(status: 'NEINCASAT'));
    
    // Nullable fields: explicitly allow null (UI will show "—" fallback)
    // These fields may be missing in Firestore after migration
    return EventModel(
      id: doc.id,
      schemaVersion: schemaVersion,
      date: dateStr,
      address: address,
      cineNoteaza: data['cineNoteaza'] as String? ?? data['notedByCode'] as String?, // null OK
      sofer: data['sofer'] as String?, // null OK
      soferPending: data['soferPending'] as String?, // null OK
      sarbatoritNume: childName,
      sarbatoritVarsta: childAge,
      sarbatoritDob: childDob,
      incasare: incasare,
      roles: roles,
      isArchived: data['isArchived'] as bool? ?? 
                  data['este arhivat'] as bool? ?? 
                  false, // DUAL-READ: isArchived or 'este arhivat' (RO)
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
      'schemaVersion': schemaVersion == 0 ? 2 : schemaVersion,
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

  static List<RoleModel> _parseRoles(dynamic data) {
    if (data is! List) return const [];
    final roles = <RoleModel>[];
    for (final item in data) {
      if (item is! Map) continue;
      try {
        roles.add(RoleModel.fromMap(Map<String, dynamic>.from(item)));
      } catch (e, st) {
        debugPrint('[EventModel] ⚠️ Skip invalid role item: $e');
        debugPrint('$st');
      }
    }
    return roles;
  }

  static List<RoleModel> _parseRolesBySlot(dynamic data) {
    if (data is! Map) return const [];
    final roles = <RoleModel>[];
    final entries = data.entries.toList()
      ..sort((a, b) => a.key.toString().compareTo(b.key.toString()));
    for (final entry in entries) {
      final slotKey = entry.key.toString();
      final rawRole = entry.value;
      if (rawRole is! Map) continue;
      try {
        final map = Map<String, dynamic>.from(rawRole);
        final normalized = <String, dynamic>{
          'slot': slotKey,
          // Prefer explicit label, fallback to roleType/type
          'label': map['label'] ?? map['roleType'] ?? map['type'] ?? '',
          // Prefer v3 startTime, fallback to time
          'time': map['startTime'] ?? map['time'] ?? '14:00',
          'durationMin': map['durationMin'] ?? map['duration'] ?? map['dur'] ?? 0,
          'assignedCode': map['assignedCode'] ?? map['assigneeCode'],
          'pendingCode': map['pendingCode'],
        };
        roles.add(RoleModel.fromMap(normalized));
      } catch (e, st) {
        debugPrint('[EventModel] ⚠️ Skip invalid rolesBySlot item: $e');
        debugPrint('$st');
      }
    }
    return roles;
  }

  static String _normalizeDateString(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return '';

    // DD-MM-YYYY
    final ddmmyyyy = RegExp(r'^\d{2}-\d{2}-\d{4}$');
    if (ddmmyyyy.hasMatch(s)) return s;

    // YYYY-MM-DD
    final yyyymmdd = RegExp(r'^\d{4}-\d{2}-\d{2}$');
    if (yyyymmdd.hasMatch(s)) {
      final parts = s.split('-');
      return '${parts[2]}-${parts[1]}-${parts[0]}';
    }

    // Best-effort: try parse and reformat
    final parsed = DateTime.tryParse(s);
    if (parsed != null) {
      return '${parsed.day.toString().padLeft(2, '0')}-${parsed.month.toString().padLeft(2, '0')}-${parsed.year}';
    }

    return s;
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
    final durationRaw =
        map['durationMin'] ?? map['duration'] ?? map['dur'];
    final durationMin = switch (durationRaw) {
      int v => v,
      num v => v.toInt(),
      String v => int.tryParse(v.trim()) ?? 0,
      _ => 0,
    };

    return RoleModel(
      slot: map['slot']?.toString() ?? '',
      label: map['label']?.toString() ?? '',
      time: map['time']?.toString() ?? '',
      durationMin: durationMin,
      assignedCode: map['assignedCode']?.toString(),
      pendingCode: map['pendingCode']?.toString(),
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
    
    // DUAL-READ: support RO field name 'stare' → EN 'status'
    String status = map['status'] as String? ?? 
                    map['stare'] as String? ?? 
                    'NEINCASAT';
    
    return IncasareModel(
      status: status,
      metoda: map['metoda'] as String?,
      suma: (map['suma'] as num?)?.toDouble(),
    );
  }

  /// V3 payment map → legacy IncasareModel (UI expects this model).
  factory IncasareModel.fromPaymentMap(Map<String, dynamic> map) {
    final rawStatus = map['status']?.toString().toUpperCase() ?? 'UNPAID';
    final status = switch (rawStatus) {
      'PAID' => 'INCASAT',
      'UNPAID' => 'NEINCASAT',
      'CANCELLED' => 'ANULAT',
      'INCASAT' => 'INCASAT',
      'NEINCASAT' => 'NEINCASAT',
      'ANULAT' => 'ANULAT',
      _ => 'NEINCASAT',
    };

    return IncasareModel(
      status: status,
      metoda: map['method']?.toString() ?? map['metoda']?.toString(),
      suma: (map['amount'] as num?)?.toDouble() ??
          (map['suma'] as num?)?.toDouble(),
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
