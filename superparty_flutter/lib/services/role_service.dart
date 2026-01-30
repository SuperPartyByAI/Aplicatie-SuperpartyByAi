import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'firebase_service.dart';
import '../config/admin_config.dart';

/// Role checks. Admin = strict email only (adminEmail). No claims/role.
/// - isAdmin = currentUser.email == adminEmail (ursache.andrei1995@gmail.com)
/// - isEmployee = staffProfiles/{uid} exists
class RoleService {
  static final RoleService _instance = RoleService._internal();
  factory RoleService() => _instance;
  RoleService._internal();

  FirebaseFirestore get _firestore => FirebaseService.firestore;
  FirebaseAuth get _auth => FirebaseService.auth;

  String? _cachedUid;
  bool? _cachedEmployee;
  bool? _cachedAdmin;
  Future<void>? _loadFuture;

  static bool _isAdminEmail(String? email) {
    if (email == null || email.isEmpty) return false;
    return email.trim().toLowerCase() == adminEmail.toLowerCase();
  }

  Future<void> _ensureLoaded() async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) {
      _cachedUid = null;
      _cachedEmployee = false;
      _cachedAdmin = false;
      return;
    }
    if (_cachedUid == uid && _cachedEmployee != null && _cachedAdmin != null) {
      return;
    }
    _loadFuture ??= _load();
    await _loadFuture!;
  }

  Future<void> _load() async {
    try {
      final user = _auth.currentUser;
      if (user == null) {
        _cachedUid = null;
        _cachedEmployee = false;
        _cachedAdmin = false;
        return;
      }
      final uid = user.uid;
      bool employee = false;
      final admin = _isAdminEmail(user.email);

      try {
        final staff = await _firestore.collection('staffProfiles').doc(uid).get();
        employee = staff.exists;
      } catch (e) {
        debugPrint('RoleService: staffProfiles read error: $e');
      }

      _cachedUid = uid;
      _cachedEmployee = employee;
      _cachedAdmin = admin;
    } finally {
      _loadFuture = null;
    }
  }

  void invalidateCache() {
    _cachedUid = null;
    _cachedEmployee = null;
    _cachedAdmin = null;
    _loadFuture = null;
  }

  Future<bool> isEmployee() async {
    await _ensureLoaded();
    return _cachedEmployee ?? false;
  }

  /// Admin = strict email only (ursache.andrei1995@gmail.com). No claims, no users.role.
  Future<bool> isAdmin() async {
    await _ensureLoaded();
    return _cachedAdmin ?? false;
  }

  Future<bool> canSeeEmployeeInbox() async {
    await _ensureLoaded();
    // Employee inbox is visible to any authenticated user (admin or non-admin).
    return _auth.currentUser != null;
  }

  Future<bool> canSeeAdminInbox() async {
    await _ensureLoaded();
    return _cachedAdmin ?? false;
  }

  Future<({bool canSeeAdminInbox, bool canSeeEmployeeInbox})> inboxVisibility() async {
    await _ensureLoaded();
    final admin = _cachedAdmin ?? false;
    final canSeeEmployee = _auth.currentUser != null;
    if (kDebugMode) {
      debugPrint('[RoleService] inboxVisibility isAdmin=$admin canSeeAdminInbox=$admin canSeeEmployeeInbox=$canSeeEmployee');
    }
    return (
      canSeeAdminInbox: admin,
      canSeeEmployeeInbox: canSeeEmployee,
    );
  }

  Future<String?> getEffectiveRole() async {
    await _ensureLoaded();
    final user = _auth.currentUser;
    if (user == null) return null;
    try {
      final staff = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (staff.exists) {
        final r = (staff.data()?['role'] as String?)?.toLowerCase();
        if (r != null && r.isNotEmpty) return r;
      }
      final users = await _firestore.collection('users').doc(user.uid).get();
      final r = (users.data()?['role'] as String?)?.toLowerCase();
      return r?.isNotEmpty == true ? r : null;
    } catch (_) {
      return null;
    }
  }

  Future<bool> isGmOrAdmin() async {
    final user = _auth.currentUser;
    if (user == null) return false;
    try {
      final doc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (!doc.exists) return false;
      final role = (doc.data()?['role'] as String?)?.toLowerCase() ?? '';
      return role == 'gm' || role == 'admin';
    } catch (e) {
      debugPrint('RoleService.isGmOrAdmin error: $e');
      return false;
    }
  }

  Future<String?> getUserRole() async {
    final user = _auth.currentUser;
    if (user == null) return null;
    try {
      final doc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (!doc.exists) return null;
      return (doc.data()?['role'] as String?)?.toLowerCase();
    } catch (e) {
      debugPrint('RoleService.getUserRole error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> getStaffProfile() async {
    final user = _auth.currentUser;
    if (user == null) return null;
    try {
      final doc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (e) {
      debugPrint('RoleService.getStaffProfile error: $e');
      return null;
    }
  }
}
