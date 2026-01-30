import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'firebase_service.dart';
import '../config/admin_config.dart';

class AdminService {
  final FirebaseAuth auth;
  final FirebaseFirestore db;
  final FirebaseFunctions functions;

  AdminService({FirebaseAuth? auth, FirebaseFirestore? db, FirebaseFunctions? functions})
      : auth = auth ?? FirebaseService.auth,
        db = db ?? FirebaseService.firestore,
        functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-central1');

  User? get currentUser => auth.currentUser;

  static String mapFunctionsError(Object e) {
    if (e is FirebaseFunctionsException) {
      final msg = (e.message ?? '').trim();
      if (msg.isNotEmpty) return msg;
      switch (e.code) {
        case 'unauthenticated':
          return 'Trebuie să fii autentificat.';
        case 'permission-denied':
          return 'Nu ai permisiuni de admin.';
        case 'invalid-argument':
          return 'Date invalide.';
        case 'not-found':
          return 'Resursa nu a fost găsită.';
        default:
          return 'Eroare server: ${e.code}';
      }
    }
    return e.toString();
  }

  /// Admin = strict email only (ursache.andrei1995@gmail.com). No claims, no users.role.
  Future<bool> isCurrentUserAdmin() async {
    final u = currentUser;
    if (u == null) return false;
    final e = (u.email ?? '').trim().toLowerCase();
    return e == adminEmail.toLowerCase();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> streamStaffProfiles({int limit = 200}) {
    return db.collection('staffProfiles').orderBy('updatedAt', descending: true).limit(limit).snapshots();
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> streamUserDoc(String uid) {
    return db.collection('users').doc(uid).snapshots();
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> streamStaffProfile(String uid) {
    return db.collection('staffProfiles').doc(uid).snapshots();
  }

  Future<void> changeUserTeam({
    required String uid,
    required String newTeamId,
    bool forceReallocate = false,
  }) async {
    final callable = functions.httpsCallable('changeUserTeam');
    try {
      await callable.call(<String, dynamic>{
        'uid': uid,
        'newTeamId': newTeamId,
        'forceReallocate': forceReallocate,
      });
    } catch (e) {
      throw StateError(mapFunctionsError(e));
    }
  }

  Future<void> setUserStatus({
    required String uid,
    required String status,
  }) async {
    final callable = functions.httpsCallable('setUserStatus');
    try {
      await callable.call(<String, dynamic>{
        'uid': uid,
        'status': status,
      });
    } catch (e) {
      throw StateError(mapFunctionsError(e));
    }
  }
}

