import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as path;
import '../models/evidence_model.dart';
import '../models/evidence_state_model.dart';

class EvidenceUploadResult {
  final String docId;
  final String downloadUrl;
  final String storagePath;
  final DateTime uploadedAt;

  EvidenceUploadResult({
    required this.docId,
    required this.downloadUrl,
    required this.storagePath,
    required this.uploadedAt,
  });
}

class EvidenceService {
  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;
  final FirebaseStorage _storage;

  EvidenceService({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
    FirebaseStorage? storage,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _auth = auth ?? FirebaseAuth.instance,
        _storage = storage ?? FirebaseStorage.instance;

  /// Upload imagine în Storage + creează doc în Firestore
  Future<EvidenceUploadResult> uploadEvidence({
    required String eventId,
    required EvidenceCategory category,
    required File imageFile,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Verifică dacă categoria e locked
      final meta = await getCategoryMeta(
        eventId: eventId,
        category: category,
      );
      if (meta.locked) {
        throw Exception('Categoria este blocată. Nu se pot adăuga poze.');
      }

      // Generează UUID pentru fișier
      final fileName = '${DateTime.now().millisecondsSinceEpoch}_${path.basename(imageFile.path)}';
      final storagePath = 'event_images/$eventId/${category.value}/$fileName';

      // Upload în Storage
      final uploadTask = _storage.ref(storagePath).putFile(imageFile);
      final snapshot = await uploadTask;
      final downloadUrl = await snapshot.ref.getDownloadURL();

      // Obține metadata fișier
      final fileSize = await imageFile.length();
      final mimeType = _getMimeType(imageFile.path);

      // Creează doc în Firestore
      final evidence = EvidenceModel(
        id: '', // Will be set by Firestore
        eventId: eventId,
        category: category,
        downloadUrl: downloadUrl,
        storagePath: storagePath,
        uploadedBy: currentUser.uid,
        uploadedAt: DateTime.now(),
        fileName: fileName,
        fileSize: fileSize,
        mimeType: mimeType,
      );

      final docRef = await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi')
          .add(evidence.toFirestore());

      // Update category metadata
      await _updateCategoryPhotoCount(eventId, category, increment: true);

      return EvidenceUploadResult(
        docId: docRef.id,
        downloadUrl: downloadUrl,
        storagePath: storagePath,
        uploadedAt: DateTime.now(),
      );
    } catch (e) {
      throw Exception('Eroare la upload dovadă: $e');
    }
  }

  /// Fetch dovezi active pentru un eveniment (exclude arhivate)
  Stream<List<EvidenceModel>> getEvidenceStream({
    required String eventId,
    EvidenceCategory? category,
  }) {
    Query query = _firestore
        .collection('evenimente')
        .doc(eventId)
        .collection('dovezi');

    // Exclude dovezi arhivate implicit (politica: never delete)
    query = query.where('isArchived', isEqualTo: false);

    if (category != null) {
      query = query.where('category', isEqualTo: category.value);
    }

    query = query.orderBy('uploadedAt', descending: true);

    return query.snapshots().map((snapshot) {
      return snapshot.docs
          .map((doc) => EvidenceModel.fromFirestore(doc, eventId))
          .toList();
    });
  }

  /// Fetch dovezi arhivate pentru un eveniment
  Stream<List<EvidenceModel>> getArchivedEvidenceStream({
    required String eventId,
    EvidenceCategory? category,
  }) {
    Query query = _firestore
        .collection('evenimente')
        .doc(eventId)
        .collection('dovezi');

    query = query.where('isArchived', isEqualTo: true);

    if (category != null) {
      query = query.where('category', isEqualTo: category.value);
    }

    query = query.orderBy('archivedAt', descending: true);

    return query.snapshots().map((snapshot) {
      return snapshot.docs
          .map((doc) => EvidenceModel.fromFirestore(doc, eventId))
          .toList();
    });
  }

  /// Fetch dovezi active ca listă (exclude arhivate)
  Future<List<EvidenceModel>> getEvidenceList({
    required String eventId,
    EvidenceCategory? category,
  }) async {
    try {
      Query query = _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi');

      // Exclude dovezi arhivate implicit
      query = query.where('isArchived', isEqualTo: false);

      if (category != null) {
        query = query.where('category', isEqualTo: category.value);
      }

      query = query.orderBy('uploadedAt', descending: true);

      final snapshot = await query.get();
      return snapshot.docs
          .map((doc) => EvidenceModel.fromFirestore(doc, eventId))
          .toList();
    } catch (e) {
      throw Exception('Eroare la încărcarea dovezilor: $e');
    }
  }

  /// Arhivează dovadă (POLITICA: NEVER DELETE)
  /// 
  /// Fișierul din Storage rămâne intact.
  /// Doar metadata din Firestore se marchează ca arhivată.
  Future<void> archiveEvidence({
    required String eventId,
    required String evidenceId,
    required EvidenceCategory category,
    String? reason,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Verifică dacă categoria e locked
      final meta = await getCategoryMeta(
        eventId: eventId,
        category: category,
      );
      if (meta.locked) {
        throw Exception('Categoria este blocată. Nu se pot arhiva poze.');
      }

      // NU ștergem din Storage - fișierul rămâne permanent
      // Doar marcăm metadata ca arhivată în Firestore
      await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi')
          .doc(evidenceId)
          .update({
        'isArchived': true,
        'archivedAt': FieldValue.serverTimestamp(),
        'archivedBy': currentUser.uid,
        if (reason != null) 'archiveReason': reason,
      });

      // Update category metadata (decrementează count)
      await _updateCategoryPhotoCount(eventId, category, increment: false);
    } catch (e) {
      throw Exception('Eroare la arhivarea dovezii: $e');
    }
  }

  /// Dezarhivează o dovadă
  Future<void> unarchiveEvidence({
    required String eventId,
    required String evidenceId,
    required EvidenceCategory category,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi')
          .doc(evidenceId)
          .update({
        'isArchived': false,
        'archivedAt': FieldValue.delete(),
        'archivedBy': FieldValue.delete(),
        'archiveReason': FieldValue.delete(),
      });

      // Update category metadata (incrementează count)
      await _updateCategoryPhotoCount(eventId, category, increment: true);
    } catch (e) {
      throw Exception('Eroare la dezarhivarea dovezii: $e');
    }
  }

  /// Lock categorie (marchează OK)
  Future<void> lockCategory({
    required String eventId,
    required EvidenceCategory category,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Verifică dacă există cel puțin o poză în categorie
      final evidenceList = await getEvidenceList(
        eventId: eventId,
        category: category,
      );

      if (evidenceList.isEmpty) {
        throw Exception('Nu se poate bloca categoria fără poze.');
      }

      // Lock categoria
      final meta = EvidenceStateModel(
        id: category.value,
        category: category,
        status: EvidenceStatus.ok,
        locked: true,
        updatedAt: DateTime.now(),
        updatedBy: currentUser.uid,
      );

      await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('evidenceState')
          .doc(category.value)
          .set(meta.toFirestore());
    } catch (e) {
      throw Exception('Eroare la blocarea categoriei: $e');
    }
  }

  /// Unlock categorie
  Future<void> unlockCategory({
    required String eventId,
    required EvidenceCategory category,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Obține metadata curentă
      final currentMeta = await getCategoryMeta(
        eventId: eventId,
        category: category,
      );

      // Update doar locked status - recreate model since no copyWith
      final meta = EvidenceStateModel(
        id: category.value,
        category: category,
        status: currentMeta.status,
        locked: false,
        updatedAt: DateTime.now(),
        updatedBy: currentUser.uid,
      );

      await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('evidenceState')
          .doc(category.value)
          .set(meta.toFirestore());
    } catch (e) {
      throw Exception('Eroare la deblocarea categoriei: $e');
    }
  }

  /// Obține metadata categorie
  Future<EvidenceStateModel> getCategoryMeta({
    required String eventId,
    required EvidenceCategory category,
  }) async {
    try {
      final doc = await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('evidenceState')
          .doc(category.value)
          .get();

      return EvidenceStateModel.fromFirestore(doc);
    } catch (e) {
      // Returnează metadata default dacă nu există
      return EvidenceStateModel(
        id: category.value,
        category: category,
        status: EvidenceStatus.na,
        locked: false,
        updatedAt: DateTime.now(),
        updatedBy: '',
      );
    }
  }

  /// Stream pentru metadata categorie
  Stream<EvidenceStateModel> getCategoryMetaStream({
    required String eventId,
    required EvidenceCategory category,
  }) {
    return _firestore
        .collection('evenimente')
        .doc(eventId)
        .collection('evidenceState')
        .doc(category.value)
        .snapshots()
        .map((doc) => EvidenceStateModel.fromFirestore(doc));
  }

  /// Update photo count pentru o categorie
  Future<void> _updateCategoryPhotoCount(
    String eventId,
    EvidenceCategory category, {
    required bool increment,
  }) async {
    try {
      final docRef = _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('evidenceState')
          .doc(category.value);

      final doc = await docRef.get();
      
      if (doc.exists) {
        final currentCount = (doc.data()?['photoCount'] as int?) ?? 0;
        final newCount = increment ? currentCount + 1 : currentCount - 1;
        
        await docRef.update({
          'photoCount': newCount.clamp(0, 999999),
          'lastUpdated': FieldValue.serverTimestamp(),
        });
      } else {
        // Creează doc nou dacă nu există
        await docRef.set({
          'locked': false,
          'photoCount': increment ? 1 : 0,
          'lastUpdated': FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      print('Warning: Could not update photo count: $e');
    }
  }

  /// Helper pentru a determina MIME type
  String _getMimeType(String filePath) {
    final extension = path.extension(filePath).toLowerCase();
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  /// Upload evidence cu path (pentru ImagePicker)
  Future<EvidenceUploadResult> uploadEvidenceFromPath({
    required String eventId,
    required EvidenceCategory category,
    required String filePath,
  }) async {
    final file = File(filePath);
    return uploadEvidence(
      eventId: eventId,
      category: category,
      imageFile: file,
    );
  }

  /// Stream pentru category states
  Stream<Map<EvidenceCategory, EvidenceStateModel>> getCategoryStatesStream(String eventId) {
    return _firestore
        .collection('evenimente')
        .doc(eventId)
        .collection('evidenceState')
        .snapshots()
        .map((snapshot) {
      final map = <EvidenceCategory, EvidenceStateModel>{};
      for (var doc in snapshot.docs) {
        final state = EvidenceStateModel.fromFirestore(doc);
        map[state.category] = state;
      }
      return map;
    });
  }

  /// Update category status
  Future<void> updateCategoryStatus({
    required String eventId,
    required EvidenceCategory category,
    required EvidenceStatus status,
    required bool locked,
  }) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) throw Exception('Utilizator neautentificat');

    await _firestore
        .collection('evenimente')
        .doc(eventId)
        .collection('evidenceState')
        .doc(category.value)
        .set({
      'category': category.value,
      'status': status.value,
      'locked': locked,
      'updatedAt': FieldValue.serverTimestamp(),
      'updatedBy': currentUser.uid,
    }, SetOptions(merge: true));
  }
}
