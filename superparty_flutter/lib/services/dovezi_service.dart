import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:image_picker/image_picker.dart';

import 'dovezi_upload.dart';

/// Firestore schema (Option 1: subcollection, simplest + scalable):
///
/// evenimente/{eventId}/dovezi/{category}
///   - category: string (redundant but handy)
///   - verdict: "na" | "necompletat" | "ok"
///   - photos: [
///       { id, url, storagePath, createdAt }
///     ]
///   - updatedAt, updatedBy (uid)
///
/// Locking behavior:
/// - locked == (verdict == "ok")
/// - we keep the existing demo logic: verdict becomes "ok" when photos.length >= 2.
class DoveziService {
  DoveziService({
    FirebaseFirestore? firestore,
    FirebaseStorage? storage,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _storage = storage ?? FirebaseStorage.instance,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> _doveziCol(String eventId) {
    return _firestore.collection('evenimente').doc(eventId).collection('dovezi');
  }

  Reference _storageRoot(String eventId, String category) {
    // Keep it simple and predictable for deletes:
    // evenimente/<eventId>/dovezi/<category>/<photoId>.jpg
    return _storage.ref().child('evenimente/$eventId/dovezi/$category');
  }

  Stream<Map<String, DoveziCategory>> streamEvidence(String eventId) {
    return _doveziCol(eventId).snapshots().map((snap) {
      final out = <String, DoveziCategory>{};
      for (final doc in snap.docs) {
        out[doc.id] = DoveziCategory.fromFirestore(doc.id, doc.data());
      }
      return out;
    });
  }

  Future<void> uploadPhotos(
    String eventId,
    String category,
    List<XFile> files,
  ) async {
    final cat = category.trim();
    if (cat.isEmpty) throw Exception('Categorie invalidă');
    if (files.isEmpty) return;

    final uid = _auth.currentUser?.uid;
    final now = Timestamp.now();
    final uploaded = <DoveziPhoto>[];
    final uploadedRefs = <Reference>[];

    try {
      for (final file in files) {
        final photoId = _makePhotoId();
        final ext = _guessExt(file.name);
        final ref = _storageRoot(eventId, cat).child('$photoId$ext');
        uploadedRefs.add(ref);

        await putXFile(
          ref,
          file,
          metadata: SettableMetadata(
            contentType: _guessContentType(ext),
          ),
        );
        final url = await ref.getDownloadURL();
        uploaded.add(
          DoveziPhoto(
            id: photoId,
            url: url,
            storagePath: ref.fullPath,
            createdAt: now.toDate(),
          ),
        );
      }

      final docRef = _doveziCol(eventId).doc(cat);
      await _firestore.runTransaction((tx) async {
        final snap = await tx.get(docRef);
        final data = snap.data();
        final current = data == null ? DoveziCategory.empty(cat) : DoveziCategory.fromFirestore(cat, data);

        if (current.locked) {
          throw Exception('Categoria este blocată (OK).');
        }

        final nextPhotos = [...current.photos, ...uploaded];
        final nextVerdict = _computeVerdict(nextPhotos.length, current.verdict);

        tx.set(
          docRef,
          {
            'category': cat,
            'verdict': nextVerdict,
            'photos': nextPhotos.map((p) => p.toMap()).toList(),
            'updatedAt': FieldValue.serverTimestamp(),
            if (uid != null) 'updatedBy': uid,
          },
          SetOptions(merge: true),
        );
      });
    } catch (e, st) {
      debugPrint('[DoveziService] uploadPhotos failed: $e');
      debugPrint('$st');

      // Best-effort cleanup for already uploaded blobs if Firestore write fails.
      for (final ref in uploadedRefs) {
        try {
          await ref.delete();
        } catch (_) {}
      }
      rethrow;
    }
  }

  Future<void> deletePhoto(
    String eventId,
    String category,
    DoveziPhoto photo,
  ) async {
    final cat = category.trim();
    if (cat.isEmpty) throw Exception('Categorie invalidă');

    final uid = _auth.currentUser?.uid;
    final docRef = _doveziCol(eventId).doc(cat);

    String? storagePathToDelete;
    await _firestore.runTransaction((tx) async {
      final snap = await tx.get(docRef);
      final data = snap.data();
      final current = data == null ? DoveziCategory.empty(cat) : DoveziCategory.fromFirestore(cat, data);

      if (current.locked) {
        throw Exception('Categoria este blocată (OK).');
      }

      final next = current.photos.where((p) => p.id != photo.id).toList();
      storagePathToDelete = current.photos.firstWhere((p) => p.id == photo.id, orElse: () => photo).storagePath;

      final nextVerdict = _computeVerdict(next.length, current.verdict);

      tx.set(
        docRef,
        {
          'category': cat,
          'verdict': nextVerdict,
          'photos': next.map((p) => p.toMap()).toList(),
          'updatedAt': FieldValue.serverTimestamp(),
          if (uid != null) 'updatedBy': uid,
        },
        SetOptions(merge: true),
      );
    });

    if (storagePathToDelete != null && storagePathToDelete!.isNotEmpty) {
      try {
        await _storage.ref(storagePathToDelete).delete();
      } catch (e) {
        debugPrint('[DoveziService] delete storage failed: $e');
      }
    }
  }

  Future<void> reverifyAll(String eventId, List<String> categories) async {
    for (final cat in categories) {
      await _recomputeVerdict(eventId, cat);
    }
  }

  Future<void> _recomputeVerdict(String eventId, String category) async {
    final cat = category.trim();
    if (cat.isEmpty) return;
    final uid = _auth.currentUser?.uid;
    final docRef = _doveziCol(eventId).doc(cat);

    await _firestore.runTransaction((tx) async {
      final snap = await tx.get(docRef);
      final data = snap.data();
      final current = data == null ? DoveziCategory.empty(cat) : DoveziCategory.fromFirestore(cat, data);

      if (current.locked) return;

      final nextVerdict = _computeVerdict(current.photos.length, current.verdict);
      tx.set(
        docRef,
        {
          'category': cat,
          'verdict': nextVerdict,
          'photos': current.photos.map((p) => p.toMap()).toList(),
          'updatedAt': FieldValue.serverTimestamp(),
          if (uid != null) 'updatedBy': uid,
        },
        SetOptions(merge: true),
      );
    });
  }

  static String _computeVerdict(int count, String currentVerdict) {
    if (currentVerdict == 'ok') return 'ok';
    if (count <= 0) return 'na';
    if (count >= 2) return 'ok';
    return 'necompletat';
  }

  static String _makePhotoId() {
    final ms = DateTime.now().millisecondsSinceEpoch;
    final rnd = (ms ^ (ms << 13)) & 0x7fffffff;
    return 'p${ms}_$rnd';
  }

  static String _guessExt(String name) {
    final n = name.toLowerCase();
    if (n.endsWith('.png')) return '.png';
    if (n.endsWith('.webp')) return '.webp';
    return '.jpg';
  }

  static String _guessContentType(String ext) {
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }
}

class DoveziCategory {
  final String category;
  final String verdict; // na | necompletat | ok
  final List<DoveziPhoto> photos;

  const DoveziCategory({
    required this.category,
    required this.verdict,
    required this.photos,
  });

  bool get locked => verdict == 'ok';

  static DoveziCategory empty(String category) {
    return DoveziCategory(category: category, verdict: 'na', photos: const []);
  }

  static DoveziCategory fromFirestore(String category, Map<String, dynamic> data) {
    final verdict = data['verdict']?.toString() ?? 'na';
    final photosRaw = data['photos'];
    final photos = <DoveziPhoto>[];
    if (photosRaw is List) {
      for (final item in photosRaw) {
        if (item is! Map) continue;
        try {
          photos.add(DoveziPhoto.fromMap(Map<String, dynamic>.from(item)));
        } catch (_) {}
      }
    }
    return DoveziCategory(category: category, verdict: verdict, photos: photos);
  }
}

class DoveziPhoto {
  final String id;
  final String url;
  final String storagePath;
  final DateTime createdAt;

  const DoveziPhoto({
    required this.id,
    required this.url,
    required this.storagePath,
    required this.createdAt,
  });

  factory DoveziPhoto.fromMap(Map<String, dynamic> map) {
    final ts = map['createdAt'];
    DateTime createdAt;
    if (ts is Timestamp) {
      createdAt = ts.toDate();
    } else {
      createdAt = DateTime.tryParse(ts?.toString() ?? '') ?? DateTime.now();
    }
    return DoveziPhoto(
      id: map['id']?.toString() ?? '',
      url: map['url']?.toString() ?? '',
      storagePath: map['storagePath']?.toString() ?? '',
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'url': url,
      'storagePath': storagePath,
      'createdAt': Timestamp.fromDate(createdAt),
    };
  }
}

