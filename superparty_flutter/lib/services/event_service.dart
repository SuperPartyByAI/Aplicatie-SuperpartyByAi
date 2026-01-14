import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/event_model.dart';
import '../models/event_filters.dart';
import '../utils/code_validator.dart';

class EventService {
  final FirebaseFirestore _firestore;

  EventService({
    FirebaseFirestore? firestore,
  }) : _firestore = firestore ?? FirebaseFirestore.instance;

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
              print('[EventService] ⚠️ Failed to parse event ${doc.id}: $e');
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
                print('[EventService] ⚠️ Failed to parse archived event ${doc.id}: $e');
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
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to archive.',
    );
  }

  /// Dezarhivează eveniment
  Future<void> unarchiveEvent(String eventId) async {
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to unarchive.',
    );
  }

  /// Generic update method for event fields
  /// Validates allowed fields and adds audit metadata
  Future<void> updateEvent(String eventId, Map<String, dynamic> patch) async {
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to update events.',
    );
  }

  /// Alocă rol (atomic update)
  Future<void> assignRole({
    required String eventId,
    required String slot,
    required String staffCode,
  }) async {
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to assign role codes.',
    );
  }

  /// Setează rol ca pending (cerere de alocare)
  Future<void> requestRole({
    required String eventId,
    required String slot,
    required String staffCode,
  }) async {
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to request role codes.',
    );
  }

  /// Acceptă cerere pending (promovează pending → assigned)
  Future<void> acceptPendingRole({
    required String eventId,
    required String slot,
  }) async {
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to accept pending.',
    );
  }

  /// Respinge cerere pending
  Future<void> rejectPendingRole({
    required String eventId,
    required String slot,
  }) async {
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to reject pending.',
    );
  }

  /// Dealocă rol
  Future<void> unassignRole({
    required String eventId,
    required String slot,
  }) async {
    throw UnsupportedError(
      'Direct writes to /evenimente are disabled. Use AI Chat (chatEventOpsV2) to unassign role codes.',
    );
  }

}
