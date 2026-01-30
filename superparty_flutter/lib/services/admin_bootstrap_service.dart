import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'retry_helper.dart';
import '../config/admin_config.dart';

/// Admin Bootstrap Service
///
/// Ensures permanent admin access for allowlisted users (bootstrapAdmin callable).
/// Skips the callable when user is already admin (strict email match).
class AdminBootstrapService {
  static final AdminBootstrapService _instance = AdminBootstrapService._internal();
  factory AdminBootstrapService() => _instance;
  AdminBootstrapService._internal();

  bool _hasBootstrapped = false;
  DateTime? _lastAttempt;

  /// Already admin = strict email match (ursache.andrei1995@gmail.com).
  bool _isAlreadyAdmin(String uid) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || user.uid != uid) return false;
    final e = (user.email ?? '').trim().toLowerCase();
    return e == adminEmail.toLowerCase();
  }

  /// Bootstrap admin access if user is in allowlist. Skips when already admin.
  Future<bool> bootstrapIfEligible() async {
    if (_hasBootstrapped) {
      debugPrint('[AdminBootstrap] Already bootstrapped in this session');
      return true;
    }

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      debugPrint('[AdminBootstrap] No user signed in, skipping');
      return false;
    }

    if (_isAlreadyAdmin(user.uid)) {
      debugPrint('[AdminBootstrap] Already admin (strict email), skipping bootstrap');
      _hasBootstrapped = true;
      return true;
    }

    // Debounce: don't call more than once per 5 minutes
    if (_lastAttempt != null) {
      final elapsed = DateTime.now().difference(_lastAttempt!);
      if (elapsed.inMinutes < 5) {
        debugPrint('[AdminBootstrap] Debounced (last attempt ${elapsed.inSeconds}s ago)');
        return false;
      }
    }
    _lastAttempt = DateTime.now();

    try {
      debugPrint('[AdminBootstrap] Attempting bootstrap for ${user.email}');
      
      final functions = FirebaseFunctions.instanceFor(region: 'us-central1');
      final callable = functions.httpsCallable('bootstrapAdmin');
      
      // Use retry helper for transient failures
      final result = await RetryHelper.retryWithBackoff(
        () => callable.call(),
        operationName: 'bootstrapAdmin',
        maxAttempts: 3, // Lower for bootstrap (don't block too long)
      );
      
      final data = result.data as Map<String, dynamic>;
      
      if (data['success'] == true) {
        debugPrint('[AdminBootstrap] ✅ SUCCESS: ${data['message']}');
        _hasBootstrapped = true;
        
        // Force token refresh to get new custom claims
        await user.getIdToken(true);
        
        return true;
      } else {
        debugPrint('[AdminBootstrap] ⚠️  Unexpected response: $data');
        return false;
      }
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'permission-denied') {
        debugPrint('[AdminBootstrap] ℹ️  Bootstrap allowlist only: ${e.message}');
        return false;
      } else {
        debugPrint('[AdminBootstrap] ❌ Error: ${e.code} - ${e.message}');
        return false;
      }
    } catch (e) {
      debugPrint('[AdminBootstrap] ❌ Unexpected error: $e');
      return false;
    }
  }

  /// Reset bootstrap flag (for testing/debugging)
  void reset() {
    _hasBootstrapped = false;
  }
}
