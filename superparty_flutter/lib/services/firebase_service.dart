import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart' show kDebugMode, debugPrint;

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
  /// 
  /// Supports emulator mode via dart-define: USE_EMULATORS=true
  static Future<void> initialize() async {
    if (_initialized) {
      debugPrint('[FirebaseService] Already initialized, skipping');
      return;
    }

    debugPrint('[FirebaseService] Initializing Firebase...');
    
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    // Opt-in emulator support via dart-define: USE_EMULATORS=true
    // Usage: flutter run --dart-define=USE_EMULATORS=true
    const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);
    if (useEmulators && kDebugMode) {
      debugPrint('[FirebaseService] 🔧 Using Firebase emulators (127.0.0.1)');
      try {
        FirebaseFirestore.instance.useFirestoreEmulator('127.0.0.1', 8082);
        FirebaseAuth.instance.useAuthEmulator('127.0.0.1', 9098);
        FirebaseFunctions.instanceFor(region: 'us-central1').useFunctionsEmulator('127.0.0.1', 5002);
        debugPrint('[FirebaseService] ✅ Emulators configured: Firestore:8082, Auth:9098, Functions:5002');
      } catch (e) {
        debugPrint('[FirebaseService] ⚠️ Emulator setup error (continuing): $e');
      }
    } else if (useEmulators && !kDebugMode) {
      debugPrint('[FirebaseService] ⚠️ USE_EMULATORS=true but not in debug mode, ignoring');
    }

    _initialized = true;
    debugPrint('[FirebaseService] ✅ Firebase initialized successfully');
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
