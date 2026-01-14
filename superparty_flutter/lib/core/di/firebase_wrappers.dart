/// Wrapper-uri pentru Firebase services
/// 
/// Implementează interfețele pentru a permite DI și mock-uri

import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../services/firebase_service.dart';
import 'interfaces.dart';

/// Implementare IFirebaseAuth folosind FirebaseService
class FirebaseAuthWrapper implements IFirebaseAuth {
  @override
  User? get currentUser => FirebaseService.currentUser;

  @override
  bool get isLoggedIn => FirebaseService.isLoggedIn;

  @override
  Stream<User?> authStateChanges() {
    return FirebaseService.auth.authStateChanges();
  }

  @override
  Future<void> signOut() {
    return FirebaseService.auth.signOut();
  }
}

/// Implementare IFirestore folosind FirebaseService
class FirestoreWrapper implements IFirestore {
  @override
  CollectionReference collection(String path) {
    return FirebaseService.firestore.collection(path);
  }
}
