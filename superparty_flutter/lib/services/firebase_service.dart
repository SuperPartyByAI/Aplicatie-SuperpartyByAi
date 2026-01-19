import 'dart:io' show Platform, Socket;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kReleaseMode, debugPrint;

import '../firebase_options.dart';

/// Firebase service with lazy initialization
/// 
/// CRITICAL: Always call FirebaseService.initialize() before accessing
/// auth or firestore getters. On web, accessing Firebase instances before
/// initialization causes "[core/no-app] No Firebase App '[DEFAULT]' has been created".
class FirebaseService {
  static bool _initialized = false;
  static String? _initError;

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

    try {
      debugPrint('[FirebaseService] Initializing Firebase...');
      
      // CRITICAL FIX: Check if Firebase app already exists before initializing
      // This prevents crash when Firebase is initialized multiple times
      try {
        Firebase.app(); // This will throw if no app exists
        debugPrint('[FirebaseService] Firebase app already exists, skipping initialization');
        _initialized = true;
        _initError = null;
        return;
      } catch (e) {
        // No app exists, proceed with initialization
        debugPrint('[FirebaseService] No existing Firebase app found, initializing...');
      }
      
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );

      // Initialize App Check based on build mode
      await _initializeAppCheck();

      // Opt-in emulator support via dart-define: USE_EMULATORS=true
      // Usage: flutter run --dart-define=USE_EMULATORS=true [--dart-define=USE_ADB_REVERSE=true]
      // IMPORTANT: On Android emulator:
      //   - USE_ADB_REVERSE=true (default): uses 127.0.0.1 (requires adb reverse)
      //   - USE_ADB_REVERSE=false: uses 10.0.2.2 (works without adb reverse)
      const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);
      const useAdbReverse = bool.fromEnvironment('USE_ADB_REVERSE', defaultValue: true);
      const emulatorHostIp = String.fromEnvironment('EMULATOR_HOST_IP', defaultValue: '');
      
      if (useEmulators && kDebugMode) {
        // Determine emulator host based on platform and configuration
        String emulatorHost;
        String hostReason;
        
        if (Platform.isAndroid) {
          // Override with explicit IP if provided (for physical devices)
          if (emulatorHostIp.isNotEmpty) {
            emulatorHost = emulatorHostIp;
            hostReason = 'explicit EMULATOR_HOST_IP (physical device)';
          } else if (useAdbReverse) {
            // Use 127.0.0.1 when adb reverse is configured (recommended, faster)
            // Requires: adb reverse tcp:8082 tcp:8082 (and 9098, 5002)
            emulatorHost = '127.0.0.1';
            hostReason = 'adb reverse configured';
          } else {
            // Use 10.0.2.2 when NOT using adb reverse (fallback, works without setup)
            // This is Android emulator's special IP that maps to host's 127.0.0.1
            // Works automatically on Android emulator, no adb reverse needed
            emulatorHost = '10.0.2.2';
            hostReason = 'Android emulator (10.0.2.2, no adb reverse)';
          }
        } else if (Platform.isIOS) {
          // iOS simulator: use 127.0.0.1 (simulator shares host network)
          emulatorHost = '127.0.0.1';
          hostReason = 'iOS simulator';
        } else {
          // Web/Desktop: always use 127.0.0.1
          emulatorHost = '127.0.0.1';
          hostReason = 'Web/Desktop';
        }
        
        const firestorePort = 8082;
        const authPort = 9098;
        const functionsPort = 5002;
        const uiPort = 4001;
        
        debugPrint('[FirebaseService] 🔧 Using Firebase emulators');
        debugPrint('[FirebaseService] Platform: ${Platform.isAndroid ? "Android" : Platform.isIOS ? "iOS" : "Other"}');
        debugPrint('[FirebaseService] Host: $emulatorHost ($hostReason)');
        
        // Preflight connectivity check (best-effort, non-blocking)
        // Run for Android (both 127.0.0.1 and 10.0.2.2) to detect firewall/port/emu issues
        if (Platform.isAndroid) {
          _checkEmulatorConnectivity(emulatorHost, authPort, firestorePort);
        }
        
        try {
          FirebaseFirestore.instance.useFirestoreEmulator(emulatorHost, firestorePort);
          FirebaseAuth.instance.useAuthEmulator(emulatorHost, authPort);
          FirebaseFunctions.instanceFor(region: 'us-central1').useFunctionsEmulator(emulatorHost, functionsPort);
          debugPrint('[FirebaseService] ✅ Emulators configured: host=$emulatorHost Firestore:$firestorePort Auth:$authPort Functions:$functionsPort UI:$uiPort');
        } catch (e) {
          debugPrint('[FirebaseService] ⚠️ Emulator setup error (continuing): $e');
        }
      } else if (useEmulators && !kDebugMode) {
        debugPrint('[FirebaseService] ⚠️ USE_EMULATORS=true but not in debug mode, ignoring');
      }

      _initialized = true;
      _initError = null;
      debugPrint('[FirebaseService] ✅ Firebase initialized successfully');
    } catch (e, stackTrace) {
      _initialized = false;
      _initError = e.toString();
      debugPrint('[FirebaseService] ❌ Firebase initialization error: $e');
      debugPrint('[FirebaseService] Stack trace: $stackTrace');
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

  /// Check if Firebase is initialized
  static bool get isInitialized => _initialized;
  
  /// Get initialization error (if any)
  static String? get initError => _initError;

  // App Check state: track failures to prevent spam
  static bool _appCheckDisabled = false;
  static DateTime? _lastAppCheckErrorLog;
  static const _appCheckErrorLogInterval = Duration(minutes: 5); // Rate limit: log every 5 minutes max

  /// Initialize Firebase App Check based on build mode
  /// 
  /// - Debug/Profile: Uses debug provider (requires debug token in Firebase Console)
  /// - Release: Uses production providers (Play Integrity for Android, App Attest for iOS)
  /// 
  /// CRITICAL FIX: Rate-limit logging and disable retry after 403/API disabled errors
  static Future<void> _initializeAppCheck() async {
    // If App Check was disabled due to previous 403 error, skip initialization
    if (_appCheckDisabled) {
      debugPrint('[FirebaseService] ⚠️ App Check disabled (403/API disabled in previous attempt) - skipping');
      return;
    }

    try {
      if (kReleaseMode) {
        // Production mode: use production providers
        debugPrint('[FirebaseService] Initializing App Check (RELEASE mode)...');
        
        if (Platform.isAndroid) {
          await FirebaseAppCheck.instance.activate(
            androidProvider: AndroidProvider.playIntegrity,
          );
          debugPrint('[FirebaseService] ✅ App Check activated: AndroidProvider.playIntegrity');
        } else if (Platform.isIOS) {
          await FirebaseAppCheck.instance.activate(
            appleProvider: AppleProvider.appAttest,
          );
          debugPrint('[FirebaseService] ✅ App Check activated: AppleProvider.appAttest');
        } else {
          debugPrint('[FirebaseService] ⚠️ App Check: Unsupported platform in release mode');
        }
      } else {
        // Debug/Profile mode: use debug provider
        debugPrint('[FirebaseService] Initializing App Check (DEBUG mode)...');
        
        if (Platform.isAndroid) {
          await FirebaseAppCheck.instance.activate(
            androidProvider: AndroidProvider.debug,
          );
          
          // Get debug token for Firebase Console (with error handling)
          try {
            final token = await FirebaseAppCheck.instance.getToken(true).timeout(
              const Duration(seconds: 5),
              onTimeout: () {
                debugPrint('[FirebaseService] ⚠️ App Check getToken timeout (5s) - skipping debug token display');
                return null;
              },
            );
            
            if (token != null) {
              debugPrint('[FirebaseService] 🔑 App Check DEBUG TOKEN (add this to Firebase Console):');
              debugPrint('[FirebaseService] 🔑 $token');
              debugPrint('[FirebaseService] 🔑 Steps:');
              debugPrint('[FirebaseService] 🔑 1. Go to Firebase Console -> App Check');
              debugPrint('[FirebaseService] 🔑 2. Click "Manage debug tokens"');
              debugPrint('[FirebaseService] 🔑 3. Add token above to allow debug builds');
            }
          } catch (tokenError) {
            // Non-critical: debug token retrieval failed, but App Check can still work
            debugPrint('[FirebaseService] ⚠️ App Check getToken failed (non-critical): $tokenError');
          }
        } else if (Platform.isIOS) {
          await FirebaseAppCheck.instance.activate(
            appleProvider: AppleProvider.debug,
          );
          debugPrint('[FirebaseService] ✅ App Check activated: AppleProvider.debug');
          debugPrint('[FirebaseService] ℹ️ iOS debug tokens are managed automatically by Firebase SDK');
        } else {
          debugPrint('[FirebaseService] ⚠️ App Check: Unsupported platform in debug mode');
        }
        
        debugPrint('[FirebaseService] ✅ App Check activated (DEBUG mode)');
        debugPrint('[FirebaseService] ℹ️ NOTE: App Check enforcement must be enabled in Firebase Console after testing');
      }
    } catch (e) {
      // Check if error is 403 / API disabled
      final errorStr = e.toString();
      final is403Error = errorStr.contains('403') || 
                         errorStr.contains('API has not been used') || 
                         errorStr.contains('API is disabled');
      
      // Rate-limit error logging (prevent spam)
      final shouldLog = _lastAppCheckErrorLog == null || 
                        DateTime.now().difference(_lastAppCheckErrorLog!) > _appCheckErrorLogInterval;
      
      if (shouldLog) {
        _lastAppCheckErrorLog = DateTime.now();
        
        if (is403Error) {
          // 403/API disabled: disable App Check for this session (no retry)
          _appCheckDisabled = true;
          debugPrint('[FirebaseService] ⚠️ App Check API disabled (403) - disabling App Check for this session');
          debugPrint('[FirebaseService] ℹ️ To enable: https://console.developers.google.com/apis/api/firebaseappcheck.googleapis.com/overview');
          debugPrint('[FirebaseService] ℹ️ App will continue without App Check enforcement');
        } else {
          // Other errors: log once, continue without App Check
          debugPrint('[FirebaseService] ⚠️ App Check initialization failed (non-blocking): $e');
          debugPrint('[FirebaseService] ℹ️ App will continue without App Check enforcement');
        }
      }
      // Else: skip logging (rate-limited)
    }
  }
  
  /// Preflight connectivity check for emulators (best-effort, non-blocking)
  /// Runs on Android for both 127.0.0.1 and 10.0.2.2 to detect firewall/port/emu issues
  static Future<void> _checkEmulatorConnectivity(String host, int authPort, int firestorePort) async {
    try {
      // Quick socket test with short timeout (300ms each, non-blocking)
      final authCheck = Socket.connect(host, authPort, timeout: const Duration(milliseconds: 300))
          .then((socket) {
            socket.destroy();
            return true;
          })
          .catchError((_) => false);
      
      final firestoreCheck = Socket.connect(host, firestorePort, timeout: const Duration(milliseconds: 300))
          .then((socket) {
            socket.destroy();
            return true;
          })
          .catchError((_) => false);
      
      final results = await Future.wait([authCheck, firestoreCheck], eagerError: false);
      final authOpen = results[0];
      final firestoreOpen = results[1];
      
      if (!authOpen || !firestoreOpen) {
        final failedPorts = <String>[];
        if (!authOpen) failedPorts.add('$host:$authPort (Auth)');
        if (!firestoreOpen) failedPorts.add('$host:$firestorePort (Firestore)');
        
        debugPrint('[FirebaseService] ⚠️ Preflight check failed: ${failedPorts.join(", ")}');
        if (Platform.isAndroid && host == '127.0.0.1') {
          debugPrint('[FirebaseService] 💡 Run: npm run emu:android (sets up adb reverse automatically)');
          debugPrint('[FirebaseService] 💡 Or manually: adb reverse tcp:9098 tcp:9098 && adb reverse tcp:8082 tcp:8082');
          debugPrint('[FirebaseService] 💡 Or use: USE_ADB_REVERSE=false (uses 10.0.2.2 automatically)');
        } else if (Platform.isAndroid && host == '10.0.2.2') {
          debugPrint('[FirebaseService] 💡 Run: npm run emu:check (verify emulators are running)');
          debugPrint('[FirebaseService] 💡 Or: npm run emu:android (start emulators + setup)');
          debugPrint('[FirebaseService] 💡 If emulators are running, check firewall/network settings');
        } else {
          debugPrint('[FirebaseService] 💡 Run: npm run emu:check (verify emulators are running)');
          debugPrint('[FirebaseService] 💡 Or: npm run emu:android (start emulators + setup)');
        }
      } else {
        debugPrint('[FirebaseService] ✓ Preflight check: ports accessible on $host');
      }
    } catch (e) {
      // Ignore preflight errors - it's just a diagnostic, don't block initialization
      debugPrint('[FirebaseService] Preflight check skipped: $e');
    }
  }
}
