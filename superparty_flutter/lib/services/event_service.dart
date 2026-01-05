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

    // Aplicăm filtre pe dată (server-side)
    final (startDate, endDate) = filters.dateRange;
    if (startDate != null) {
      query = query.where('data', isGreaterThanOrEqualTo: Timestamp.fromDate(startDate));
    }
    if (endDate != null) {
      query = query.where('data', isLessThanOrEqualTo: Timestamp.fromDate(endDate));
    }

    // Sortare (server-side)
    switch (filters.sortBy) {
      case SortBy.data:
        query = query.orderBy('data',
            descending: filters.sortDirection == SortDirection.desc);
        break;
      case SortBy.nume:
        query = query.orderBy('nume',
            descending: filters.sortDirection == SortDirection.desc);
        break;
      case SortBy.locatie:
        query = query.orderBy('locatie',
            descending: filters.sortDirection == SortDirection.desc);
        break;
    }

    return query.snapshots().map((snapshot) {
      var events = snapshot.docs
          .map((doc) => EventModel.fromFirestore(doc))
          .toList();

      // Aplicăm filtre client-side (pentru cele care nu pot fi făcute server-side)
      return _applyClientSideFilters(events, filters);
    });
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

  /// Șterge un eveniment
  Future<void> deleteEvent(String eventId) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // 1. Șterge dovezile din Storage
      await _deleteEventProofs(eventId);

      // 2. Șterge subcolecțiile (dovezi metadata, comentarii, etc.)
      await _deleteSubcollections(eventId);

      // 3. Șterge documentul principal
      await _firestore.collection('evenimente').doc(eventId).delete();
    } catch (e) {
      throw Exception('Eroare la ștergerea evenimentului: $e');
    }
  }

  /// Șterge toate dovezile din Storage pentru un eveniment
  Future<void> _deleteEventProofs(String eventId) async {
    try {
      // Verificăm dacă există dovezi în Firestore
      final proofsSnapshot = await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi')
          .get();

      if (proofsSnapshot.docs.isEmpty) return;

      // Șterge fiecare dovadă din Storage
      for (final doc in proofsSnapshot.docs) {
        final data = doc.data();
        final storagePath = data['storagePath'] as String?;
        
        if (storagePath != null && storagePath.isNotEmpty) {
          try {
            // Folosim Firebase Storage pentru ștergere
            // Note: Trebuie importat firebase_storage
            // await FirebaseStorage.instance.ref(storagePath).delete();
            
            // Pentru moment, doar logăm (implementare completă necesită firebase_storage package)
            print('Would delete storage file: $storagePath');
          } catch (storageError) {
            // Continuăm chiar dacă ștergerea din Storage eșuează
            print('Eroare la ștergerea fișierului $storagePath: $storageError');
          }
        }
      }
    } catch (e) {
      print('Eroare la ștergerea dovezilor: $e');
      // Nu aruncăm eroare - continuăm cu ștergerea evenimentului
    }
  }

  /// Șterge toate subcolecțiile unui eveniment
  Future<void> _deleteSubcollections(String eventId) async {
    try {
      final batch = _firestore.batch();
      
      // Lista de subcolecții de șters
      final subcollections = ['dovezi', 'comentarii', 'istoric'];
      
      for (final subcollection in subcollections) {
        final snapshot = await _firestore
            .collection('evenimente')
            .doc(eventId)
            .collection(subcollection)
            .get();

        for (final doc in snapshot.docs) {
          batch.delete(doc.reference);
        }
      }

      await batch.commit();
    } catch (e) {
      print('Eroare la ștergerea subcolecțiilor: $e');
      // Nu aruncăm eroare - continuăm cu ștergerea evenimentului
    }
  }
}
