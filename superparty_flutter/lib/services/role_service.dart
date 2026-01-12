import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'firebase_service.dart';

/// Service for detecting user roles from staffProfiles
/// 
/// Roles:
/// - employee: has staffProfiles/{uid} document
/// - gm: employee + role == 'gm'
/// - admin: employee + role == 'admin'
class RoleService {
  // Use lazy getters from FirebaseService instead of instance fields
  FirebaseFirestore get _firestore => FirebaseService.firestore;
  FirebaseAuth get _auth => FirebaseService.auth;

  /// Check if current user is an employee (has staff profile)
  Future<bool> isEmployee() async {
    final user = _auth.currentUser;
    if (user == null) return false;

    try {
      final doc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      return doc.exists;
    } catch (e) {
      print('RoleService.isEmployee error: $e');
      return false;
    }
  }

  /// Check if current user is GM or Admin
  Future<bool> isGmOrAdmin() async {
    final user = _auth.currentUser;
    if (user == null) return false;

    try {
      final doc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (!doc.exists) return false;

      final role = (doc.data()?['role'] as String?)?.toLowerCase() ?? '';
      return role == 'gm' || role == 'admin';
    } catch (e) {
      print('RoleService.isGmOrAdmin error: $e');
      return false;
    }
  }

  /// Get user role from staffProfiles
  /// Returns: 'admin', 'gm', 'staff', or null if not employee
  Future<String?> getUserRole() async {
    final user = _auth.currentUser;
    if (user == null) return null;

    try {
      final doc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (!doc.exists) return null;

      return (doc.data()?['role'] as String?)?.toLowerCase();
    } catch (e) {
      print('RoleService.getUserRole error: $e');
      return null;
    }
  }

  /// Get staff profile data
  Future<Map<String, dynamic>?> getStaffProfile() async {
    final user = _auth.currentUser;
    if (user == null) return null;

    try {
      final doc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (!doc.exists) return null;

      return doc.data();
    } catch (e) {
      print('RoleService.getStaffProfile error: $e');
      return null;
    }
  }

  /// BACKWARD COMPATIBILITY: Check if user is admin by email
  /// This is kept as fallback for existing "admin" secret command
  bool isAdminByEmail() {
    final user = _auth.currentUser;
    return user?.email == 'ursache.andrei1995@gmail.com';
  }
}
