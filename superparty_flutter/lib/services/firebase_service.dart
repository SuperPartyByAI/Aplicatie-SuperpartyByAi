import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';

/// Bootstrap status for Firebase initialization
enum BootstrapStatus {
  loading,
  success,
  failed,
}

/// Firebase service with lazy initialization
/// 
/// CRITICAL: Always call FirebaseService.initialize() before accessing
/// auth or firestore getters. On web, accessing Firebase instances before
/// initialization causes "[core/no-app] No Firebase App '[DEFAULT]' has been created".
class FirebaseService {
  static bool _initialized = false;
  static BootstrapStatus _status = BootstrapStatus.loading;
  static String? _lastError;

  /// Initialize Firebase with platform-specific options
  /// 
  /// Must be called before accessing any Firebase services.
  /// Safe to call multiple times (idempotent).
  static Future<void> initialize() async {
    if (_initialized) {
      debugPrint('[FirebaseService] Already initialized, skipping');
      _status = BootstrapStatus.success;
      return;
    }

    try {
      debugPrint('[FirebaseService] Initializing Firebase...');
      
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );

      _initialized = true;
      _status = BootstrapStatus.success;
      _lastError = null;
      debugPrint('[FirebaseService] ✅ Firebase initialized successfully');
    } catch (e, stack) {
      _initialized = false;
      _status = BootstrapStatus.failed;
      _lastError = e.toString();
      debugPrint('[FirebaseService] ❌ Firebase initialization failed: $e');
      debugPrint('[FirebaseService] Stack: $stack');
      rethrow;
    }
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

  /// Get current bootstrap status
  static BootstrapStatus get status => _status;

  /// Get last error message
  static String? get lastError => _lastError;

  /// Reset status for retry
  static void resetForRetry() {
    _status = BootstrapStatus.loading;
    _lastError = null;
  }

  /// Check if Firebase is initialized
  static bool get isInitialized => _initialized;
}
