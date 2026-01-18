import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

/// Admin Bootstrap Service
/// 
/// Ensures permanent admin access for allowlisted users.
/// Call once on app start (idempotent - safe to call multiple times).
class AdminBootstrapService {
  static final AdminBootstrapService _instance = AdminBootstrapService._internal();
  factory AdminBootstrapService() => _instance;
  AdminBootstrapService._internal();

  bool _hasBootstrapped = false;

  /// Bootstrap admin access if user is in allowlist.
  /// 
  /// This sets:
  /// - Firebase Auth custom claim: admin=true (persists across sessions)
  /// - Firestore users/{uid}.role="admin" (never overwritten by login)
  /// 
  /// Only allowlisted emails can succeed. Others will get permission-denied.
  /// 
  /// Returns true if admin was set OR already set, false if not eligible.
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

    try {
      debugPrint('[AdminBootstrap] Attempting bootstrap for ${user.email}');
      
      final functions = FirebaseFunctions.instanceFor(region: 'us-central1');
      final callable = functions.httpsCallable('bootstrapAdmin');
      
      final result = await callable.call();
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
        debugPrint('[AdminBootstrap] ℹ️  Not eligible for admin (not in allowlist): ${e.message}');
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
