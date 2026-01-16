import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/event_model.dart';
import '../models/event_filters.dart';
import '../utils/code_validator.dart';
import '../core/errors/result.dart';

class EventService {
  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  EventService({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _auth = auth ?? FirebaseAuth.instance;

  /// Stream evenimente ACTIVE (isArchived=false implicit)
  Stream<List<EventModel>> getEventsStream(EventFilters filters) {
    // Fetch ALL non-archived events, sort client-side to avoid index requirement
    Query query = _firestore.collection('evenimente')
        .where('isArchived', isEqualTo: false);

    return query.snapshots().map((snapshot) {
      var events = snapshot.docs
          .map((doc) {
            try {
              return EventModel.fromFirestore(doc);
            } catch (e) {
              debugPrint('[EventService] ⚠️ Failed to parse event ${doc.id}: $e');
              return null;
            }
          })
          .whereType<EventModel>() // Filter out nulls
          .toList();

      // Filtre client-side (nu pot fi făcute server-side)
      return _applyClientSideFilters(events, filters);
    });
  }

  /// Stream evenimente ARHIVATE
  Stream<List<EventModel>> getArchivedEventsStream() {
    return _firestore
        .collection('evenimente')
        .where('isArchived', isEqualTo: true)
        .orderBy('archivedAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) {
              try {
                return EventModel.fromFirestore(doc);
              } catch (e) {
                debugPrint('[EventService] ⚠️ Failed to parse archived event ${doc.id}: $e');
                return null;
              }
            })
            .whereType<EventModel>() // Filter out nulls
            .toList());
  }

  /// Filtre client-side
  List<EventModel> _applyClientSideFilters(
    List<EventModel> events,
    EventFilters filters,
  ) {
    return events.where((event) {
      // Driver filter
      switch (filters.driverFilter) {
        case DriverFilter.yes:
          if (!event.needsDriver) return false;
          break;
        case DriverFilter.open:
          if (!event.needsDriver || event.hasDriverAssigned) return false;
          break;
        case DriverFilter.no:
          if (event.needsDriver) return false;
          break;
        case DriverFilter.all:
          break;
      }

      // Staff code filter ("Ce cod am")
      if (filters.staffCode != null) {
        final code = CodeValidator.normalize(filters.staffCode!);
        if (!CodeValidator.isValidStaffCode(code)) return false;
        
        // Verifică dacă codul e alocat sau pending în roles
        bool found = false;
        for (var role in event.roles) {
          if (role.assignedCode == code || role.pendingCode == code) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      }

      // Noted by filter ("Cine notează")
      if (filters.notedBy != null) {
        final code = CodeValidator.normalize(filters.notedBy!);
        if (!CodeValidator.isValidStaffCode(code)) return false;
        if (event.cineNoteaza != code) return false;
      }

      return true;
    }).toList();
  }

  /// Arhivează eveniment (NEVER DELETE)
  Future<void> archiveEvent(String eventId, {String? reason}) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    await _firestore.collection('evenimente').doc(eventId).update({
      'isArchived': true,
      'archivedAt': FieldValue.serverTimestamp(),
      'archivedBy': user.uid,
      if (reason != null) 'archiveReason': reason,
      'updatedAt': FieldValue.serverTimestamp(),
      'updatedBy': user.uid,
    });
  }

  /// Dezarhivează eveniment
  Future<void> unarchiveEvent(String eventId) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    await _firestore.collection('evenimente').doc(eventId).update({
      'isArchived': false,
      'archivedAt': FieldValue.delete(),
      'archivedBy': FieldValue.delete(),
      'archiveReason': FieldValue.delete(),
      'updatedAt': FieldValue.serverTimestamp(),
      'updatedBy': user.uid,
    });
  }

  /// Generic update method for event fields
  /// Validates allowed fields and adds audit metadata
  Future<void> updateEvent(String eventId, Map<String, dynamic> patch) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    // Allowed fields for update
    const allowedFields = {
      'date',
      'address',
      'sarbatoritNume',
      'sarbatoritVarsta',
      'sarbatoritDob',
      'incasare',
      'roles',
      'cineNoteaza',
      'sofer',
      'soferPending',
    };

    // Filter to only allowed fields
    final sanitized = <String, dynamic>{};
    for (final entry in patch.entries) {
      if (allowedFields.contains(entry.key)) {
        sanitized[entry.key] = entry.value;
      }
    }

    if (sanitized.isEmpty) {
      throw Exception('Nu există câmpuri valide pentru actualizare');
    }

    // Add audit metadata
    sanitized['updatedAt'] = FieldValue.serverTimestamp();
    sanitized['updatedBy'] = user.uid;

    // Prevent changing archive status through this method
    sanitized.remove('isArchived');
    sanitized.remove('archivedAt');
    sanitized.remove('archivedBy');
    sanitized.remove('archiveReason');

    await _firestore.collection('evenimente').doc(eventId).update(sanitized);
  }

  /// Alocă rol (atomic update)
  Future<void> assignRole({
    required String eventId,
    required String slot,
    required String staffCode,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    if (!CodeValidator.isValidStaffCode(staffCode)) {
      throw Exception('Cod staff invalid: $staffCode');
    }

    await _firestore.runTransaction((transaction) async {
      final docRef = _firestore.collection('evenimente').doc(eventId);
      final snapshot = await transaction.get(docRef);
      
      if (!snapshot.exists) {
        throw Exception('Eveniment nu există');
      }

      final event = EventModel.fromFirestore(snapshot);
      final roles = List<RoleModel>.from(event.roles);
      
      // Găsește slot-ul
      final index = roles.indexWhere((r) => r.slot == slot);
      if (index == -1) {
        throw Exception('Slot $slot nu există');
      }

      // Update rol
      roles[index] = RoleModel(
        slot: roles[index].slot,
        label: roles[index].label,
        time: roles[index].time,
        durationMin: roles[index].durationMin,
        assignedCode: staffCode,
        pendingCode: null, // Clear pending
      );

      transaction.update(docRef, {
        'roles': roles.map((r) => r.toMap()).toList(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': user.uid,
      });
    });
  }

  /// Setează rol ca pending (cerere de alocare)
  Future<void> requestRole({
    required String eventId,
    required String slot,
    required String staffCode,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    if (!CodeValidator.isValidStaffCode(staffCode)) {
      throw Exception('Cod staff invalid: $staffCode');
    }

    await _firestore.runTransaction((transaction) async {
      final docRef = _firestore.collection('evenimente').doc(eventId);
      final snapshot = await transaction.get(docRef);
      
      if (!snapshot.exists) {
        throw Exception('Eveniment nu există');
      }

      final event = EventModel.fromFirestore(snapshot);
      final roles = List<RoleModel>.from(event.roles);
      
      final index = roles.indexWhere((r) => r.slot == slot);
      if (index == -1) {
        throw Exception('Slot $slot nu există');
      }

      // Update rol cu pending
      roles[index] = RoleModel(
        slot: roles[index].slot,
        label: roles[index].label,
        time: roles[index].time,
        durationMin: roles[index].durationMin,
        assignedCode: roles[index].assignedCode,
        pendingCode: staffCode,
      );

      transaction.update(docRef, {
        'roles': roles.map((r) => r.toMap()).toList(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': user.uid,
      });
    });
  }

  /// Acceptă cerere pending (promovează pending → assigned)
  Future<void> acceptPendingRole({
    required String eventId,
    required String slot,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    await _firestore.runTransaction((transaction) async {
      final docRef = _firestore.collection('evenimente').doc(eventId);
      final snapshot = await transaction.get(docRef);
      
      if (!snapshot.exists) {
        throw Exception('Eveniment nu există');
      }

      final event = EventModel.fromFirestore(snapshot);
      final roles = List<RoleModel>.from(event.roles);
      
      final index = roles.indexWhere((r) => r.slot == slot);
      if (index == -1) {
        throw Exception('Slot $slot nu există');
      }

      final pendingCode = roles[index].pendingCode;
      if (pendingCode == null || pendingCode.isEmpty) {
        throw Exception('Nu există cerere pending pentru slot $slot');
      }

      // Promovează pending → assigned
      roles[index] = RoleModel(
        slot: roles[index].slot,
        label: roles[index].label,
        time: roles[index].time,
        durationMin: roles[index].durationMin,
        assignedCode: pendingCode,
        pendingCode: null,
      );

      transaction.update(docRef, {
        'roles': roles.map((r) => r.toMap()).toList(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': user.uid,
      });
    });
  }

  /// Respinge cerere pending
  Future<void> rejectPendingRole({
    required String eventId,
    required String slot,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    await _firestore.runTransaction((transaction) async {
      final docRef = _firestore.collection('evenimente').doc(eventId);
      final snapshot = await transaction.get(docRef);
      
      if (!snapshot.exists) {
        throw Exception('Eveniment nu există');
      }

      final event = EventModel.fromFirestore(snapshot);
      final roles = List<RoleModel>.from(event.roles);
      
      final index = roles.indexWhere((r) => r.slot == slot);
      if (index == -1) {
        throw Exception('Slot $slot nu există');
      }

      // Clear pending
      roles[index] = RoleModel(
        slot: roles[index].slot,
        label: roles[index].label,
        time: roles[index].time,
        durationMin: roles[index].durationMin,
        assignedCode: roles[index].assignedCode,
        pendingCode: null,
      );

      transaction.update(docRef, {
        'roles': roles.map((r) => r.toMap()).toList(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': user.uid,
      });
    });
  }

  /// Dealocă rol
  Future<void> unassignRole({
    required String eventId,
    required String slot,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('Utilizator neautentificat');

    await _firestore.runTransaction((transaction) async {
      final docRef = _firestore.collection('evenimente').doc(eventId);
      final snapshot = await transaction.get(docRef);
      
      if (!snapshot.exists) {
        throw Exception('Eveniment nu există');
      }

      final event = EventModel.fromFirestore(snapshot);
      final roles = List<RoleModel>.from(event.roles);
      
      final index = roles.indexWhere((r) => r.slot == slot);
      if (index == -1) {
        throw Exception('Slot $slot nu există');
      }

      // Clear assigned
      roles[index] = RoleModel(
        slot: roles[index].slot,
        label: roles[index].label,
        time: roles[index].time,
        durationMin: roles[index].durationMin,
        assignedCode: null,
        pendingCode: roles[index].pendingCode,
      );

      transaction.update(docRef, {
        'roles': roles.map((r) => r.toMap()).toList(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': user.uid,
      });
    });
  }

  /// Get single event by ID
  Future<EventModel> getEvent(String eventId) async {
    final doc = await _firestore.collection('evenimente').doc(eventId).get();
    if (!doc.exists) {
      throw Exception('Eveniment nu există');
    }
    return EventModel.fromFirestore(doc);
  }

  /// Get single event by ID (safe version returning Result)
  Future<Result<EventModel>> getEventSafe(String eventId) async {
    try {
      final doc = await _firestore.collection('evenimente').doc(eventId).get();
      if (!doc.exists) {
        return Result.failure('Eveniment nu există');
      }
      return Result.success(EventModel.fromFirestore(doc));
    } catch (e) {
      return Result.failure('Eroare la încărcarea evenimentului: $e', error: e);
    }
  }

  /// Update role assignment (compatibility wrapper)
  Future<void> updateRoleAssignment({
    required String eventId,
    required String role,
    String? userId,
  }) async {
    try {
      // Find role by slot (A-J) or label
      final eventResult = await getEventSafe(eventId);
      if (eventResult.isFailure) {
        debugPrint('[EventService] ⚠️ ${eventResult.errorOrNull}');
        return;
      }
      
      final event = eventResult.value;
      final roleModel = event.roles.firstWhere(
        (r) => r.slot == role.toUpperCase() || r.label.toLowerCase() == role.toLowerCase(),
        orElse: () => RoleModel(
          slot: 'unknown',
          label: role,
          time: '',
          durationMin: 0,
        ),
      );
      
      // If role doesn't exist, return gracefully
      if (roleModel.slot == 'unknown') {
        debugPrint('[EventService] ⚠️ Rol "$role" nu există în eveniment $eventId - operație ignorată');
        return;
      }

      if (userId == null) {
        // Unassign
        await unassignRole(eventId: eventId, slot: roleModel.slot);
      } else {
        // This path is not used by current UI - userId would need to be looked up from staff collection
        // For now, we gracefully skip this instead of throwing
        debugPrint('[EventService] ⚠️ updateRoleAssignment cu userId necesită implementare completă - operație ignorată');
        // If this becomes needed, implement:
        // 1. Query staff collection to get staffCode from userId
        // 2. Call assignRole with the staffCode
        // For now, return gracefully instead of throwing
        return;
      }
    } catch (e) {
      debugPrint('[EventService] ⚠️ Eroare la updateRoleAssignment: $e');
      // Return gracefully instead of throwing
    }
  }

  /// Update driver assignment (compatibility wrapper)
  Future<void> updateDriverAssignment({
    required String eventId,
    String? userId,
  }) async {
    try {
      final user = _auth.currentUser;
      if (user == null) {
        debugPrint('[EventService] ⚠️ Utilizator neautentificat la updateDriverAssignment');
        return;
      }

      // Verify event exists before updating
      final eventResult = await getEventSafe(eventId);
      if (eventResult.isFailure) {
        debugPrint('[EventService] ⚠️ ${eventResult.errorOrNull}');
        return;
      }

      await _firestore.collection('evenimente').doc(eventId).update({
        'sofer': userId,
        'soferPending': null, // Clear pending when assigning
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': user.uid,
      });
    } catch (e) {
      debugPrint('[EventService] ⚠️ Eroare la updateDriverAssignment: $e');
      // Return gracefully instead of throwing
    }
  }
}
