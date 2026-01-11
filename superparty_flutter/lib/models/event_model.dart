import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Model pentru eveniment (schema v3)
class EventModel {
  final String id; // Firestore docId
  
  // Identificare
  final int eventShortId; // ID scurt numeric (1, 2, 3...99999)
  
  // Date eveniment
  final String date; // DD-MM-YYYY
  final String address;
  
  // Contact client
  final String? phoneE164; // normalizat (+40...)
  final String? phoneRaw; // exact cum a scris
  
  // Date sărbătorit (comune pentru moștenire la roluri)
  final String? childName;
  final int? childAge; // vârsta reală/împlinită
  final String? childDob; // DD-MM-YYYY
  final String? parentName;
  final String? parentPhone; // E.164
  final int? numChildren;
  
  // Încasare (compatibilitate - păstrăm)
  final IncasareModel? payment;
  
  // Roluri (MAP cu cheie slot complet)
  final Map<String, RoleModel> rolesBySlot; // ex: {"01A": {...}, "01B": {...}}
  
  // Cine a notat (doar cod, mapare prin staffProfiles)
  final String? notedByCode; // ex: "A13"
  
  // Arhivare (NEVER DELETE)
  final bool isArchived;
  final DateTime? archivedAt;
  final String? archivedBy;
  final String? archiveReason;
  
  // Audit
  final DateTime createdAt;
  final String createdBy; // cod/uid/"script de configurare"
  final DateTime updatedAt;
  final String updatedBy;
  
  // Idempotency
  final String? clientRequestId;

  EventModel({
    required this.id,
    required this.eventShortId,
    required this.date,
    required this.address,
    this.phoneE164,
    this.phoneRaw,
    this.childName,
    this.childAge,
    this.childDob,
    this.parentName,
    this.parentPhone,
    this.numChildren,
    this.payment,
    required this.rolesBySlot,
    this.notedByCode,
    this.isArchived = false,
    this.archivedAt,
    this.archivedBy,
    this.archiveReason,
    required this.createdAt,
    required this.createdBy,
    required this.updatedAt,
    required this.updatedBy,
    this.clientRequestId,
  });

  factory EventModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    debugPrint('[EventModel] Parsing event ${doc.id}');
    
    // TRIPLE-READ: suport v1 + v2 + v3
    // v3: schemaVersion=3, eventShortId (numeric), rolesBySlot (map), date/address (EN)
    // v2: schemaVersion=2, date/address (EN), roles (array)
    // v1: date (Timestamp), alocari (map)
    
    final schemaVersion = data['schemaVersion'] as int? ?? 
                          data['versiuneSchema'] as int? ?? 1;
    
    // Date field: suport date (EN) + data (RO) + Timestamp (v1)
    String dateStr;
    if (data.containsKey('date') && data['date'] is String) {
      dateStr = data['date'] as String;
    } else if (data.containsKey('data') && data['data'] is String) {
      dateStr = data['data'] as String;
    } else if (data.containsKey('date') && data['date'] is Timestamp) {
      final timestamp = (data['date'] as Timestamp).toDate();
      dateStr = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
    } else if (data.containsKey('data') && data['data'] is Timestamp) {
      final timestamp = (data['data'] as Timestamp).toDate();
      dateStr = '${timestamp.day.toString().padLeft(2, '0')}-${timestamp.month.toString().padLeft(2, '0')}-${timestamp.year}';
    } else {
      dateStr = '';
      debugPrint('[EventModel] ⚠️ No valid date field found');
    }
    
    // Address: suport address (EN) + adresa (RO) + locatie (v1)
    final address = data['address'] as String? ?? 
                    data['adresa'] as String? ?? 
                    data['locatie'] as String? ?? '';
    
    // eventShortId: nou în v3 (numeric), fallback la 0
    int eventShortId;
    if (data['eventShortId'] is int) {
      eventShortId = data['eventShortId'] as int;
    } else if (data['numarEveniment'] is int) {
      // v2 compatibility: numarEveniment was int
      eventShortId = data['numarEveniment'] as int;
    } else if (data['numarEveniment'] is String) {
      // v2 compatibility: numarEveniment was string, parse to int
      eventShortId = int.tryParse(data['numarEveniment'] as String) ?? 0;
    } else {
      eventShortId = 0;
    }
    
    // Phone: suport phoneE164/phoneRaw (EN) + telefonClientE164/Raw (RO)
    final phoneE164 = data['phoneE164'] as String? ?? 
                      data['telefonClientE164'] as String?;
    final phoneRaw = data['phoneRaw'] as String? ?? 
                     data['telefonClientRaw'] as String?;
    
    // Roles: suport rolesBySlot (map v3) + roluriPeSlot (RO) + roles (array v2) + alocari (map v1)
    Map<String, RoleModel> rolesBySlot;
    if (data.containsKey('rolesBySlot') && data['rolesBySlot'] is Map) {
      // v3: rolesBySlot (map)
      rolesBySlot = _parseRolesBySlot(data['rolesBySlot'] as Map<String, dynamic>);
    } else if (data.containsKey('roluriPeSlot') && data['roluriPeSlot'] is Map) {
      // v3 română: roluriPeSlot (map)
      rolesBySlot = _parseRolesBySlot(data['roluriPeSlot'] as Map<String, dynamic>);
    } else if (data.containsKey('roles') && data['roles'] is List) {
      // v2: roles (array) → convert to map
      rolesBySlot = _convertRolesArrayToMap(data['roles'] as List<dynamic>, eventShortId);
    } else if (data.containsKey('roluri') && data['roluri'] is List) {
      // v2 română: roluri (array) → convert to map
      rolesBySlot = _convertRolesArrayToMap(data['roluri'] as List<dynamic>, eventShortId);
    } else if (data.containsKey('alocari') && data['alocari'] is Map) {
      // v1: alocari (map) → convert to rolesBySlot
      rolesBySlot = _convertAlocariV1ToMap(data['alocari'] as Map<String, dynamic>, eventShortId);
    } else {
      rolesBySlot = {};
    }
    
    return EventModel(
      id: doc.id,
      eventShortId: eventShortId,
      date: dateStr,
      address: address,
      phoneE164: phoneE164,
      phoneRaw: phoneRaw,
      childName: data['childName'] as String? ?? 
                 data['sarbatoritNume'] as String? ?? 
                 data['nume'] as String?,
      childAge: data['childAge'] as int? ?? 
                data['sarbatoritVarsta'] as int?,
      childDob: data['childDob'] as String? ?? 
                data['sarbatoritDataNastere'] as String? ?? 
                data['sarbatoritDob'] as String?,
      parentName: data['parentName'] as String? ?? 
                  data['parinteNume'] as String?,
      parentPhone: data['parentPhone'] as String? ?? 
                   data['parinteTelefon'] as String?,
      numChildren: data['numChildren'] as int? ?? 
                   data['nrCopiiAprox'] as int?,
      payment: data['payment'] != null 
          ? IncasareModel.fromMap(data['payment'] as Map<String, dynamic>)
          : (data['incasare'] != null 
              ? IncasareModel.fromMap(data['incasare'] as Map<String, dynamic>)
              : null),
      rolesBySlot: rolesBySlot,
      notedByCode: data['notedByCode'] as String? ?? 
                   data['notatDeCod'] as String? ?? 
                   data['cineNoteaza'] as String?,
      isArchived: data['isArchived'] as bool? ?? 
                  data['esteArhivat'] as bool? ?? 
                  data['este arhivat'] as bool? ?? 
                  false,
      archivedAt: (data['archivedAt'] as Timestamp?)?.toDate() ?? 
                  (data['arhivatLa'] as Timestamp?)?.toDate(),
      archivedBy: data['archivedBy'] as String? ?? 
                  data['arhivatDe'] as String?,
      archiveReason: data['archiveReason'] as String? ?? 
                     data['motivArhivare'] as String?,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? 
                 (data['creatLa'] as Timestamp?)?.toDate() ?? 
                 DateTime.now(),
      createdBy: data['createdBy'] as String? ?? 
                 data['creatDe'] as String? ?? 
                 '',
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? 
                 (data['actualizatLa'] as Timestamp?)?.toDate() ?? 
                 DateTime.now(),
      updatedBy: data['updatedBy'] as String? ?? 
                 data['actualizatDe'] as String? ?? 
                 '',
      clientRequestId: data['clientRequestId'] as String?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'schemaVersion': 3, // v3
      'eventShortId': eventShortId,
      'date': date,
      'address': address,
      if (phoneE164 != null) 'phoneE164': phoneE164,
      if (phoneRaw != null) 'phoneRaw': phoneRaw,
      if (childName != null) 'childName': childName,
      if (childAge != null) 'childAge': childAge,
      if (childDob != null) 'childDob': childDob,
      if (parentName != null) 'parentName': parentName,
      if (parentPhone != null) 'parentPhone': parentPhone,
      if (numChildren != null) 'numChildren': numChildren,
      if (payment != null) 'payment': payment!.toMap(),
      'rolesBySlot': rolesBySlot.map((key, role) => MapEntry(key, role.toMap())),
      if (notedByCode != null) 'notedByCode': notedByCode,
      'isArchived': isArchived,
      if (archivedAt != null) 'archivedAt': Timestamp.fromDate(archivedAt!),
      if (archivedBy != null) 'archivedBy': archivedBy,
      if (archiveReason != null) 'archiveReason': archiveReason,
      'createdAt': Timestamp.fromDate(createdAt),
      'createdBy': createdBy,
      'updatedAt': Timestamp.fromDate(updatedAt),
      'updatedBy': updatedBy,
      if (clientRequestId != null) 'clientRequestId': clientRequestId,
    };
  }
  
  /// Parse rolesBySlot (v3 map format)
  static Map<String, RoleModel> _parseRolesBySlot(Map<String, dynamic> data) {
    final result = <String, RoleModel>{};
    data.forEach((slot, roleData) {
      if (roleData is Map<String, dynamic>) {
        result[slot] = RoleModel.fromMap(roleData);
      }
    });
    return result;
  }
  
  /// Convert roles array (v2) to rolesBySlot map (v3)
  static Map<String, RoleModel> _convertRolesArrayToMap(
    List<dynamic> roles,
    int eventShortId,
  ) {
    final result = <String, RoleModel>{};
    final letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    for (int i = 0; i < roles.length; i++) {
      if (roles[i] is Map<String, dynamic>) {
        final roleData = roles[i] as Map<String, dynamic>;
        
        // Generate slot if missing
        String slot = roleData['slot'] as String? ?? '';
        if (slot.isEmpty && i < letters.length) {
          // Format: eventShortId padded to 2 digits + letter
          slot = '${eventShortId.toString().padLeft(2, '0')}${letters[i]}';
        }
        
        if (slot.isNotEmpty) {
          final role = RoleModel.fromMap(roleData);
          result[slot] = role.copyWith(slot: slot);
        }
      }
    }
    return result;
  }
  
  /// Convert alocari v1 (map) to rolesBySlot v3 (map)
  static Map<String, RoleModel> _convertAlocariV1ToMap(
    Map<String, dynamic> alocari,
    int eventShortId,
  ) {
    final result = <String, RoleModel>{};
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
      final letter = slotMap[key] ?? 'A';
      // Format: eventShortId padded to 2 digits + letter
      final slot = '${eventShortId.toString().padLeft(2, '0')}$letter';
      final code = value as String?;
      
      if (code != null && code.isNotEmpty) {
        result[slot] = RoleModel(
          slot: slot,
          roleType: key,
          label: _capitalize(key),
          startTime: '14:00', // default
          durationMin: 120, // default
          assignedCode: code,
        );
      }
    });
    
    return result;
  }
  
  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  /// Get roles as sorted list (for UI display)
  List<RoleModel> get rolesList {
    final list = rolesBySlot.values.toList();
    // Sort by slot (01A, 01B, 02A...)
    list.sort((a, b) => a.slot.compareTo(b.slot));
    return list;
  }
  
  /// Get active (non-archived) roles
  List<RoleModel> get activeRoles {
    return rolesList.where((r) => r.status != 'archived').toList();
  }
  
  /// Check if event has pending tasks
  bool get hasPendingTasks {
    return rolesBySlot.values.any((r) => r.hasPending);
  }
  
  /// Check if event is in the future (date >= today)
  bool get isFuture {
    try {
      final parts = date.split('-');
      if (parts.length != 3) return false;
      final day = int.parse(parts[0]);
      final month = int.parse(parts[1]);
      final year = int.parse(parts[2]);
      final eventDate = DateTime(year, month, day);
      final today = DateTime.now();
      final todayDate = DateTime(today.year, today.month, today.day);
      return eventDate.isAfter(todayDate) || eventDate.isAtSameMomentAs(todayDate);
    } catch (e) {
      debugPrint('[EventModel] Error parsing date: $e');
      return false;
    }
  }
  
  /// Romanian field aliases (for UI display)
  String get numarEveniment => eventShortId.toString().padLeft(2, '0');
  int get versiuneSchema => schemaVersion;
  Map<String, RoleModel> get roluriPeSlot => rolesBySlot;
  String get data => date;
  String get adresa => address;
  String? get telefonClientE164 => phoneE164;
  String? get telefonClientRaw => phoneRaw;
  
  /// Backward compatibility aliases
  @Deprecated('Use rolesList instead')
  List<RoleModel> get listaRoluri => rolesList;
  
  @Deprecated('Use activeRoles instead')
  List<RoleModel> get roluriActive => activeRoles;
  
  @Deprecated('Use hasPendingTasks instead')
  bool get areSarciniPending => hasPendingTasks;
  
  @Deprecated('Use isFuture instead')
  bool get esteFutur => isFuture;
}

/// Model pentru rol (schema v3)
class RoleModel {
  // Identificare
  final String slot; // ex: "01A", "01B"
  final String roleType; // ex: "animator", "ursitoare_buna", "ursitoare_rea"
  final String label; // ex: "Animator", "Ursitoare bună"
  
  // Timing
  final String startTime; // HH:mm
  final int durationMin;
  
  // Status & Alocare
  final String status; // active/archived/draft/confirmed/assigned/done/canceled
  final String? assigneeUid;
  final String? assigneeCode;
  final String? assignedCode; // compatibilitate
  final String? pendingCode;
  
  // Detalii specifice rolului
  final Map<String, dynamic> details;
  final Map<String, dynamic>? pending; // ex: {personaj: {status, dueAt}}
  
  // Extra
  final String? notes;
  final List<dynamic>? checklist;
  final List<dynamic>? resources;

  RoleModel({
    required this.slot,
    required this.roleType,
    required this.label,
    required this.startTime,
    required this.durationMin,
    this.status = 'active',
    this.assigneeUid,
    this.assigneeCode,
    this.assignedCode,
    this.pendingCode,
    this.details = const {},
    this.pending,
    this.notes,
    this.checklist,
    this.resources,
  });

  factory RoleModel.fromMap(Map<String, dynamic> map) {
    // Determine status: if isArchived/esteArhivat is true, status is 'archived'
    String status;
    if (map['status'] is String) {
      status = map['status'] as String;
    } else if (map['stare'] is String) {
      status = map['stare'] as String;
    } else if (map['isArchived'] == true || map['esteArhivat'] == true) {
      status = 'archived';
    } else {
      status = 'active';
    }
    
    return RoleModel(
      slot: map['slot'] as String? ?? '',
      roleType: map['roleType'] as String? ?? 
                map['cheieRol'] as String? ?? 
                map['roleKey'] as String? ?? '',
      label: map['label'] as String? ?? 
             map['eticheta'] as String? ?? '',
      startTime: map['startTime'] as String? ?? 
                 map['oraStart'] as String? ?? 
                 map['time'] as String? ?? '',
      durationMin: map['durationMin'] as int? ?? 
                   map['durataMin'] as int? ?? 0,
      status: status,
      assigneeUid: map['assigneeUid'] as String? ?? 
                   map['asignatUid'] as String?,
      assigneeCode: map['assigneeCode'] as String? ?? 
                    map['asignatCod'] as String?,
      assignedCode: map['assignedCode'] as String? ?? 
                    map['codAtribuit'] as String?,
      pendingCode: map['pendingCode'] as String? ?? 
                   map['codInAsteptare'] as String?,
      details: map['details'] as Map<String, dynamic>? ?? 
               map['brief'] as Map<String, dynamic>? ?? {},
      pending: map['pending'] as Map<String, dynamic>?,
      notes: map['notes'] as String? ?? map['note'] as String?,
      checklist: map['checklist'] as List<dynamic>?,
      resources: map['resources'] as List<dynamic>? ?? 
                 map['resurse'] as List<dynamic>?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'slot': slot,
      'roleType': roleType,
      'label': label,
      'startTime': startTime,
      'durationMin': durationMin,
      'status': status,
      if (assigneeUid != null) 'assigneeUid': assigneeUid,
      if (assigneeCode != null) 'assigneeCode': assigneeCode,
      if (assignedCode != null) 'assignedCode': assignedCode,
      if (pendingCode != null) 'pendingCode': pendingCode,
      'details': details,
      if (pending != null) 'pending': pending,
      if (notes != null) 'notes': notes,
      if (checklist != null) 'checklist': checklist,
      if (resources != null) 'resources': resources,
    };
  }
  
  /// Copy with method for immutable updates
  RoleModel copyWith({
    String? slot,
    String? roleType,
    String? label,
    String? startTime,
    int? durationMin,
    String? status,
    String? assigneeUid,
    String? assigneeCode,
    String? assignedCode,
    String? pendingCode,
    Map<String, dynamic>? details,
    Map<String, dynamic>? pending,
    String? notes,
    List<dynamic>? checklist,
    List<dynamic>? resources,
  }) {
    return RoleModel(
      slot: slot ?? this.slot,
      roleType: roleType ?? this.roleType,
      label: label ?? this.label,
      startTime: startTime ?? this.startTime,
      durationMin: durationMin ?? this.durationMin,
      status: status ?? this.status,
      assigneeUid: assigneeUid ?? this.assigneeUid,
      assigneeCode: assigneeCode ?? this.assigneeCode,
      assignedCode: assignedCode ?? this.assignedCode,
      pendingCode: pendingCode ?? this.pendingCode,
      details: details ?? this.details,
      pending: pending ?? this.pending,
      notes: notes ?? this.notes,
      checklist: checklist ?? this.checklist,
      resources: resources ?? this.resources,
    );
  }

  /// Status vizual pentru UI (compatibilitate)
  RoleStatusEnum get statusEnum {
    if (assignedCode != null && assignedCode!.isNotEmpty) {
      return RoleStatusEnum.assigned;
    }
    if (assigneeCode != null && assigneeCode!.isNotEmpty) {
      return RoleStatusEnum.assigned;
    }
    if (pendingCode != null && pendingCode!.isNotEmpty) {
      return RoleStatusEnum.pending;
    }
    return RoleStatusEnum.unassigned;
  }
  
  /// Check if role has pending items
  bool get hasPending {
    return pending != null && pending!.isNotEmpty;
  }
  
  /// Get formatted duration (ex: "2h" or "1.5h")
  String get formattedDuration {
    if (durationMin < 60) {
      return '${durationMin}min';
    }
    final hours = durationMin / 60;
    if (hours == hours.toInt()) {
      return '${hours.toInt()}h';
    }
    return '${hours.toStringAsFixed(1)}h';
  }
  
  /// Backward compatibility aliases
  @Deprecated('Use hasPending instead')
  bool get arePending => hasPending;
  
  @Deprecated('Use formattedDuration instead')
  String get durataFormatata => formattedDuration;
}

enum RoleStatusEnum {
  assigned,   // verde
  pending,    // galben
  unassigned, // gri
}

/// Model pentru încasare
class IncasareModel {
  final String status; // PAID / UNPAID / CANCELED
  final String? method; // CASH / CARD / TRANSFER
  final double? amount;

  IncasareModel({
    required this.status,
    this.method,
    this.amount,
  });

  factory IncasareModel.fromMap(Map<String, dynamic>? map) {
    if (map == null) {
      return IncasareModel(status: 'UNPAID');
    }
    
    // DUAL-READ: support RO/EN field names
    String status = map['status'] as String? ?? 
                    map['stare'] as String? ?? 
                    'UNPAID';
    
    // Normalize old Romanian values to English
    if (status == 'NEINCASAT') status = 'UNPAID';
    if (status == 'INCASAT') status = 'PAID';
    if (status == 'ANULAT') status = 'CANCELED';
    
    return IncasareModel(
      status: status,
      method: map['method'] as String? ?? map['metoda'] as String?,
      amount: (map['amount'] as num?)?.toDouble() ?? 
              (map['suma'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'status': status,
      if (method != null) 'method': method,
      if (amount != null) 'amount': amount,
    };
  }
}
