import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:path/path.dart' as path;
import '../models/evidence_model.dart';

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
  Future<String> uploadEvidence({
    required String eventId,
    required EvidenceCategory categorie,
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
        categorie: categorie,
      );
      if (meta.locked) {
        throw Exception('Categoria este blocată. Nu se pot adăuga poze.');
      }

      // Generează UUID pentru fișier
      final fileName = '${DateTime.now().millisecondsSinceEpoch}_${path.basename(imageFile.path)}';
      final storagePath = 'event_images/$eventId/${categorie.value}/$fileName';

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
        categorie: categorie,
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
      await _updateCategoryPhotoCount(eventId, categorie, increment: true);

      return docRef.id;
    } catch (e) {
      throw Exception('Eroare la upload dovadă: $e');
    }
  }

  /// Fetch dovezi pentru un eveniment (opțional filtrate pe categorie)
  Stream<List<EvidenceModel>> getEvidenceStream({
    required String eventId,
    EvidenceCategory? categorie,
  }) {
    Query query = _firestore
        .collection('evenimente')
        .doc(eventId)
        .collection('dovezi');

    if (categorie != null) {
      query = query.where('categorie', isEqualTo: categorie.value);
    }

    query = query.orderBy('uploadedAt', descending: true);

    return query.snapshots().map((snapshot) {
      return snapshot.docs
          .map((doc) => EvidenceModel.fromFirestore(doc, eventId))
          .toList();
    });
  }

  /// Fetch dovezi ca listă (nu stream)
  Future<List<EvidenceModel>> getEvidenceList({
    required String eventId,
    EvidenceCategory? categorie,
  }) async {
    try {
      Query query = _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi');

      if (categorie != null) {
        query = query.where('categorie', isEqualTo: categorie.value);
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

  /// Șterge dovadă (Storage + Firestore)
  Future<void> deleteEvidence({
    required String eventId,
    required String evidenceId,
    required String storagePath,
    required EvidenceCategory categorie,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Verifică dacă categoria e locked
      final meta = await getCategoryMeta(
        eventId: eventId,
        categorie: categorie,
      );
      if (meta.locked) {
        throw Exception('Categoria este blocată. Nu se pot șterge poze.');
      }

      // Șterge din Storage
      try {
        await _storage.ref(storagePath).delete();
      } catch (e) {
        // Ignoră eroarea dacă fișierul nu există în Storage
        print('Warning: Could not delete from Storage: $e');
      }

      // Șterge din Firestore
      await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi')
          .doc(evidenceId)
          .delete();

      // Update category metadata
      await _updateCategoryPhotoCount(eventId, categorie, increment: false);
    } catch (e) {
      throw Exception('Eroare la ștergerea dovezii: $e');
    }
  }

  /// Lock categorie (marchează OK)
  Future<void> lockCategory({
    required String eventId,
    required EvidenceCategory categorie,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Verifică dacă există cel puțin o poză în categorie
      final evidenceList = await getEvidenceList(
        eventId: eventId,
        categorie: categorie,
      );

      if (evidenceList.isEmpty) {
        throw Exception('Nu se poate bloca categoria fără poze.');
      }

      // Lock categoria
      final meta = EvidenceCategoryMeta(
        categorie: categorie,
        locked: true,
        lockedBy: currentUser.uid,
        lockedAt: DateTime.now(),
        photoCount: evidenceList.length,
        lastUpdated: DateTime.now(),
      );

      await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi_meta')
          .doc(categorie.value)
          .set(meta.toFirestore());
    } catch (e) {
      throw Exception('Eroare la blocarea categoriei: $e');
    }
  }

  /// Unlock categorie
  Future<void> unlockCategory({
    required String eventId,
    required EvidenceCategory categorie,
  }) async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw Exception('Utilizator neautentificat');
      }

      // Obține metadata curentă
      final currentMeta = await getCategoryMeta(
        eventId: eventId,
        categorie: categorie,
      );

      // Update doar locked status
      final meta = currentMeta.copyWith(
        locked: false,
        lockedBy: null,
        lockedAt: null,
        lastUpdated: DateTime.now(),
      );

      await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi_meta')
          .doc(categorie.value)
          .set(meta.toFirestore());
    } catch (e) {
      throw Exception('Eroare la deblocarea categoriei: $e');
    }
  }

  /// Obține metadata categorie
  Future<EvidenceCategoryMeta> getCategoryMeta({
    required String eventId,
    required EvidenceCategory categorie,
  }) async {
    try {
      final doc = await _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi_meta')
          .doc(categorie.value)
          .get();

      return EvidenceCategoryMeta.fromFirestore(doc);
    } catch (e) {
      // Returnează metadata default dacă nu există
      return EvidenceCategoryMeta(
        categorie: categorie,
        locked: false,
        photoCount: 0,
        lastUpdated: DateTime.now(),
      );
    }
  }

  /// Stream pentru metadata categorie
  Stream<EvidenceCategoryMeta> getCategoryMetaStream({
    required String eventId,
    required EvidenceCategory categorie,
  }) {
    return _firestore
        .collection('evenimente')
        .doc(eventId)
        .collection('dovezi_meta')
        .doc(categorie.value)
        .snapshots()
        .map((doc) => EvidenceCategoryMeta.fromFirestore(doc));
  }

  /// Update photo count pentru o categorie
  Future<void> _updateCategoryPhotoCount(
    String eventId,
    EvidenceCategory categorie, {
    required bool increment,
  }) async {
    try {
      final docRef = _firestore
          .collection('evenimente')
          .doc(eventId)
          .collection('dovezi_meta')
          .doc(categorie.value);

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
}
