library interfaces;

/// Interfețe pentru abstracții Firebase
/// 
/// Scop: Permite mock-uri în teste și reduce cuplajul direct la Firebase

import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Abstracție pentru Firebase Auth
abstract class IFirebaseAuth {
  User? get currentUser;
  bool get isLoggedIn;
  Stream<User?> authStateChanges();
  Future<void> signOut();
}

/// Abstracție pentru Firestore
abstract class IFirestore {
  CollectionReference collection(String path);
}
