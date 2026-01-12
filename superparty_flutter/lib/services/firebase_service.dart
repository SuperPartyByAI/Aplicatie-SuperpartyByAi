import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';

/// Firebase service with lazy initialization
/// 
/// CRITICAL: Always call FirebaseService.initialize() before accessing
/// auth or firestore getters. On web, accessing Firebase instances before
/// initialization causes "[core/no-app] No Firebase App '[DEFAULT]' has been created".
class FirebaseService {
  static bool _initialized = false;

  /// Initialize Firebase with platform-specific options
  /// 
  /// Must be called before accessing any Firebase services.
  /// Safe to call multiple times (idempotent).
  static Future<void> initialize() async {
    if (_initialized) {
      print('[FirebaseService] Already initialized, skipping');
      return;
    }

    print('[FirebaseService] Initializing Firebase...');
    
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    _initialized = true;
    print('[FirebaseService] ✅ Firebase initialized successfully');
  }

  /// Lazy getter for FirebaseAuth
  /// 
  /// Accesses FirebaseAuth.instance only after initialization.
  /// Throws if accessed before initialize() is called.
  static FirebaseAuth get auth {
    if (!_initialized) {
      throw StateError(
        '[FirebaseService] Firebase not initialized! '
        'Call FirebaseService.initialize() before accessing auth.',
      );
    }
    return FirebaseAuth.instance;
  }

  /// Lazy getter for FirebaseFirestore
  /// 
  /// Accesses FirebaseFirestore.instance only after initialization.
  /// Throws if accessed before initialize() is called.
  static FirebaseFirestore get firestore {
    if (!_initialized) {
      throw StateError(
        '[FirebaseService] Firebase not initialized! '
        'Call FirebaseService.initialize() before accessing firestore.',
      );
    }
    return FirebaseFirestore.instance;
  }

  /// Get current authenticated user
  static User? get currentUser => _initialized ? auth.currentUser : null;

  /// Check if user is logged in
  static bool get isLoggedIn => _initialized && auth.currentUser != null;

  /// Check if Firebase is initialized
  static bool get isInitialized => _initialized;
}
