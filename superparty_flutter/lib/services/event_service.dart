import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/event_model.dart';
import '../models/event_filters.dart';
import '../utils/event_utils.dart' as utils;

class EventService {
  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  EventService({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _auth = auth ?? FirebaseAuth.instance;

  /// Stream de evenimente cu filtre aplicate
  Stream<List<EventModel>> getEventsStream(EventFilters filters) {
    Query query = _firestore.collection('evenimente');

    // Exclude evenimente arhivate implicit (politica: never delete)
    query = query.where('isArchived', isEqualTo: false);

    // Aplicăm filtre pe dată (server-side)
    final (startDate, endDate) = filters.dateRange;
    final hasDateRange = startDate != null || endDate != null;
    
    if (startDate != null) {
      query = query.where('data', isGreaterThanOrEqualTo: Timestamp.fromDate(startDate));
    }
    if (endDate != null) {
      query = query.where('data', isLessThanOrEqualTo: Timestamp.fromDate(endDate));
    }

    // Sortare: când există range pe data, Firestore cere orderBy('data') primul
    // Sortarea pe nume/locatie se face client-side
    if (hasDateRange || filters.sortBy == SortBy.data) {
      // Când avem range sau sortare pe data, folosim orderBy('data')
      query = query.orderBy('data',
          descending: filters.sortDirection == SortDirection.desc);
    } else {
      // Fără range, putem sorta direct pe nume/locatie
      switch (filters.sortBy) {
        case SortBy.nume:
          query = query.orderBy('nume',
              descending: filters.sortDirection == SortDirection.desc);
          break;
        case SortBy.locatie:
          query = query.orderBy('locatie',
              descending: filters.sortDirection == SortDirection.desc);
          break;
        case SortBy.data:
          // Already handled above
          break;
      }
    }

    return query.snapshots().map((snapshot) {
      var events = snapshot.docs
          .map((doc) => EventModel.fromFirestore(doc))
          .toList();

      // Aplicăm filtre client-side (pentru cele care nu pot fi făcute server-side)
      events = _applyClientSideFilters(events, filters);
      
      // Sortare client-side pentru nume/locatie când avem dateRange
      if (hasDateRange && filters.sortBy != SortBy.data) {
        events = _sortClientSide(events, filters);
      }
      
      return events;
    });
  }

  /// Sortare client-side (când nu poate fi făcută server-side)
  List<EventModel> _sortClientSide(List<EventModel> events, EventFilters filters) {
    final descending = filters.sortDirection == SortDirection.desc;
    
    switch (filters.sortBy) {
      case SortBy.nume:
        events.sort((a, b) {
          final comparison = a.nume.compareTo(b.nume);
          return descending ? -comparison : comparison;
        });
        break;
      case SortBy.locatie:
        events.sort((a, b) {
          final comparison = a.locatie.compareTo(b.locatie);
          return descending ? -comparison : comparison;
        });
        break;
      case SortBy.data:
        // Already sorted server-side
        break;
    }
    
    return events;
  }

  /// Aplică filtre client-side
  List<EventModel> _applyClientSideFilters(
    List<EventModel> events,
    EventFilters filters,
  ) {
    return events.where((event) {
      // Search query
      if (filters.searchQuery != null && filters.searchQuery!.isNotEmpty) {
        final query = filters.searchQuery!.toLowerCase();
        if (!event.nume.toLowerCase().contains(query) &&
            !event.locatie.toLowerCase().contains(query)) {
          return false;
        }
      }

      // Tip eveniment
      if (filters.tipEveniment != null &&
          event.tipEveniment != filters.tipEveniment) {
        return false;
      }

      // Tip locație
      if (filters.tipLocatie != null && event.tipLocatie != filters.tipLocatie) {
        return false;
      }

      // Requires șofer
      if (filters.requiresSofer != null &&
          event.requiresSofer != filters.requiresSofer) {
        return false;
      }

      // Assigned to me
      if (filters.assignedToMe != null) {
        final userId = filters.assignedToMe!;
        final isAssigned = event.alocari.values.any((role) => role.userId == userId) ||
            event.sofer.userId == userId;
        if (!isAssigned) {
          return false;
        }
      }

      return true;
    }).toList();
  }

  /// Obține un eveniment specific
  Future<EventModel?> getEvent(String eventId) async {
    try {
      final doc = await _firestore.collection('evenimente').doc(eventId).get();
      if (!doc.exists) return null;
      return EventModel.fromFirestore(doc);
    } catch (e) {
      throw Exception('Eroare la încărcarea evenimentului: $e');
    }
  }

  /// Actualizează alocarea unui rol
  Future<void> updateRoleAssignment({
    required String eventId,
    required String role,
    String? userId,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      final assignment = RoleAssignment(
        userId: userId,
        status: userId != null
            ? AssignmentStatus.assigned
            : AssignmentStatus.unassigned,
      );

      await _firestore.collection('evenimente').doc(eventId).update({
        'alocari.$role': assignment.toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': currentUser.uid,
      });
    } catch (e) {
      throw Exception('Eroare la actualizarea alocării: $e');
    }
  }

  /// Actualizează alocarea șoferului
  Future<void> updateDriverAssignment({
    required String eventId,
    String? userId,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Obținem evenimentul pentru a verifica dacă necesită șofer
      final event = await getEvent(eventId);
      if (event == null) {
        throw Exception('Eveniment negăsit');
      }

      if (!event.requiresSofer) {
        throw Exception('Acest eveniment nu necesită șofer');
      }

      final driverAssignment = DriverAssignment(
        required: true,
        userId: userId,
        status: userId != null
            ? DriverStatus.assigned
            : DriverStatus.unassigned,
      );

      await _firestore.collection('evenimente').doc(eventId).update({
        'sofer': driverAssignment.toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': currentUser.uid,
      });
    } catch (e) {
      throw Exception('Eroare la actualizarea șoferului: $e');
    }
  }

  /// Actualizează câmpul requiresSofer bazat pe tipEveniment și tipLocatie
  Future<void> updateRequiresSofer({
    required String eventId,
    required String tipEveniment,
    required String tipLocatie,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      final requiresSofer = utils.requiresSofer(
        tipEveniment: tipEveniment,
        tipLocatie: tipLocatie,
      );

      final driverAssignment = DriverAssignment(
        required: requiresSofer,
        userId: null,
        status: requiresSofer
            ? DriverStatus.unassigned
            : DriverStatus.notRequired,
      );

      await _firestore.collection('evenimente').doc(eventId).update({
        'requiresSofer': requiresSofer,
        'sofer': driverAssignment.toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': currentUser.uid,
      });
    } catch (e) {
      throw Exception('Eroare la actualizarea requiresSofer: $e');
    }
  }

  /// Creează un eveniment nou
  Future<String> createEvent({
    required String nume,
    required String locatie,
    required DateTime data,
    required String tipEveniment,
    required String tipLocatie,
    Map<String, RoleAssignment>? alocari,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      final requiresSofer = utils.requiresSofer(
        tipEveniment: tipEveniment,
        tipLocatie: tipLocatie,
      );

      final driverAssignment = DriverAssignment(
        required: requiresSofer,
        userId: null,
        status: requiresSofer
            ? DriverStatus.unassigned
            : DriverStatus.notRequired,
      );

      final event = EventModel(
        id: '', // Will be set by Firestore
        nume: nume,
        locatie: locatie,
        data: data,
        tipEveniment: tipEveniment,
        tipLocatie: tipLocatie,
        requiresSofer: requiresSofer,
        alocari: alocari ?? {},
        sofer: driverAssignment,
        createdAt: DateTime.now(),
        createdBy: currentUser.uid,
        updatedAt: DateTime.now(),
        updatedBy: currentUser.uid,
      );

      final docRef = await _firestore
          .collection('evenimente')
          .add(event.toFirestore());

      return docRef.id;
    } catch (e) {
      throw Exception('Eroare la crearea evenimentului: $e');
    }
  }

  /// Arhivează un eveniment (politica: never delete)
  /// 
  /// În loc să ștergem evenimente, le marcăm ca arhivate.
  /// Fișierele din Storage și subcolecțiile rămân intacte.
  Future<void> archiveEvent(String eventId, {String? reason}) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Actualizăm documentul cu câmpuri de arhivare
      await _firestore.collection('evenimente').doc(eventId).update({
        'isArchived': true,
        'archivedAt': FieldValue.serverTimestamp(),
        'archivedBy': currentUser.uid,
        if (reason != null) 'archiveReason': reason,
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': currentUser.uid,
      });

      // Opțional: arhivează și dovezile (metadata, nu fișierele)
      await _archiveSubcollections(eventId);
    } catch (e) {
      throw Exception('Eroare la arhivarea evenimentului: $e');
    }
  }

  /// Dezarhivează un eveniment
  Future<void> unarchiveEvent(String eventId) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      await _firestore.collection('evenimente').doc(eventId).update({
        'isArchived': false,
        'archivedAt': FieldValue.delete(),
        'archivedBy': FieldValue.delete(),
        'archiveReason': FieldValue.delete(),
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': currentUser.uid,
      });
    } catch (e) {
      throw Exception('Eroare la dezarhivarea evenimentului: $e');
    }
  }

  /// Arhivează subcolecțiile unui eveniment (dovezi, comentarii)
  /// Nota: Nu ștergem nimic, doar marcăm ca arhivat
  Future<void> _archiveSubcollections(String eventId) async {
    try {
      final batch = _firestore.batch();
      final timestamp = FieldValue.serverTimestamp();
      final currentUser = _auth.currentUser;
      
      // Lista de subcolecții de arhivat
      final subcollections = ['dovezi', 'comentarii'];
      
      for (final subcollection in subcollections) {
        final snapshot = await _firestore
            .collection('evenimente')
            .doc(eventId)
            .collection(subcollection)
            .get();

        for (final doc in snapshot.docs) {
          batch.update(doc.reference, {
            'isArchived': true,
            'archivedAt': timestamp,
            'archivedBy': currentUser?.uid ?? 'system',
          });
        }
      }

      await batch.commit();
    } catch (e) {
      print('Eroare la arhivarea subcolecțiilor: $e');
      // Nu aruncăm eroare - evenimentul principal e deja arhivat
    }
  }

  /// Stream pentru evenimente arhivate
  Stream<List<EventModel>> getArchivedEventsStream() {
    return _firestore
        .collection('evenimente')
        .where('isArchived', isEqualTo: true)
        .orderBy('archivedAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => EventModel.fromFirestore(doc))
            .toList());
  }
}
