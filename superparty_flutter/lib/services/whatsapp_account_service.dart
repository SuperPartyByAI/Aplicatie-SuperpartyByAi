import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'firebase_service.dart';
import 'role_service.dart';

/// Service for managing WhatsApp account assignments per user
/// 
/// Maps user → WhatsApp accountIds:
/// - myWhatsAppAccountId: Personal WhatsApp account (one per user)
/// - employeeWhatsAppAccountIds: Team/employee accounts (multiple per employee)
class WhatsAppAccountService {
  static final WhatsAppAccountService instance = WhatsAppAccountService._();
  WhatsAppAccountService._();

  FirebaseFirestore get _firestore => FirebaseService.firestore;
  FirebaseAuth get _auth => FirebaseService.auth;
  final RoleService _roleService = RoleService();

  /// Get user's personal WhatsApp account ID
  /// Returns null if not set
  Future<String?> getMyWhatsAppAccountId() async {
    final user = _auth.currentUser;
    if (user == null) return null;

    try {
      final doc = await _firestore.collection('users').doc(user.uid).get();
      if (!doc.exists) return null;

      return doc.data()?['myWhatsAppAccountId'] as String?;
    } catch (e) {
      debugPrint('WhatsAppAccountService.getMyWhatsAppAccountId error: $e');
      return null;
    }
  }

  /// Get employee's allowed WhatsApp account IDs
  /// Returns empty list if not employee or no accounts assigned
  Future<List<String>> getEmployeeWhatsAppAccountIds() async {
    final user = _auth.currentUser;
    if (user == null) return [];

    try {
      // Check if user is employee
      final isEmployee = await _roleService.isEmployee();
      if (!isEmployee) return [];

      // Try users collection first
      final userDoc = await _firestore.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        final accountIds = userDoc.data()?['employeeWhatsAppAccountIds'];
        if (accountIds is List) {
          return accountIds.cast<String>().where((id) => id.isNotEmpty).toList();
        }
      }

      // Fallback: try staffProfiles collection
      final staffDoc = await _firestore.collection('staffProfiles').doc(user.uid).get();
      if (staffDoc.exists) {
        final accountIds = staffDoc.data()?['whatsAppAccountIds'] ?? staffDoc.data()?['employeeWhatsAppAccountIds'];
        if (accountIds is List) {
          return accountIds.cast<String>().where((id) => id.isNotEmpty).toList();
        }
      }

      return [];
    } catch (e) {
      debugPrint('WhatsAppAccountService.getEmployeeWhatsAppAccountIds error: $e');
      return [];
    }
  }

  /// Get all account IDs user has access to (my + employee)
  Future<List<String>> getAllowedAccountIds() async {
    final myAccountId = await getMyWhatsAppAccountId();
    final employeeAccountIds = await getEmployeeWhatsAppAccountIds();

    final allIds = <String>{};
    if (myAccountId != null && myAccountId.isNotEmpty) {
      allIds.add(myAccountId);
    }
    for (final id in employeeAccountIds) {
      if (id.isNotEmpty) {
        allIds.add(id);
      }
    }

    return allIds.toList();
  }

  /// Set user's personal WhatsApp account ID
  Future<bool> setMyWhatsAppAccountId(String accountId) async {
    final user = _auth.currentUser;
    if (user == null) return false;

    try {
      await _firestore.collection('users').doc(user.uid).set({
        'myWhatsAppAccountId': accountId,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      return true;
    } catch (e) {
      debugPrint('WhatsAppAccountService.setMyWhatsAppAccountId error: $e');
      return false;
    }
  }

  /// Set employee's allowed WhatsApp account IDs
  Future<bool> setEmployeeWhatsAppAccountIds(List<String> accountIds) async {
    final user = _auth.currentUser;
    if (user == null) return false;

    try {
      // Check if user is employee/admin
      final isEmployee = await _roleService.isEmployee();
      if (!isEmployee) return false;

      await _firestore.collection('users').doc(user.uid).set({
        'employeeWhatsAppAccountIds': accountIds,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      return true;
    } catch (e) {
      debugPrint('WhatsAppAccountService.setEmployeeWhatsAppAccountIds error: $e');
      return false;
    }
  }
}
