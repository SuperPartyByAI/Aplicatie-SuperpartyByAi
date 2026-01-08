import 'package:flutter/foundation.dart';

class AppStateProvider extends ChangeNotifier {
  bool _isGridOpen = false;
  bool _isAdminMode = false;
  bool _isGmMode = false;
  bool _isEmployee = false;
  String? _userRole;

  bool get isGridOpen => _isGridOpen;
  bool get isAdminMode => _isAdminMode;
  bool get isGmMode => _isGmMode;
  bool get isEmployee => _isEmployee;
  String? get userRole => _userRole;
  
  /// Check if user is GM or Admin (has elevated permissions)
  bool get isGmOrAdmin => _isGmMode || _isAdminMode;

  void toggleGrid() {
    _isGridOpen = !_isGridOpen;
    notifyListeners();
  }

  void openGrid() {
    _isGridOpen = true;
    notifyListeners();
  }

  void closeGrid() {
    _isGridOpen = false;
    notifyListeners();
  }

  void setAdminMode(bool value) {
    _isAdminMode = value;
    notifyListeners();
  }

  void setGmMode(bool value) {
    _isGmMode = value;
    notifyListeners();
  }

  void exitAdminMode() {
    _isAdminMode = false;
    notifyListeners();
  }

  void exitGmMode() {
    _isGmMode = false;
    notifyListeners();
  }

  /// Set employee status and role from staffProfiles
  void setEmployeeStatus(bool isEmployee, String? role) {
    _isEmployee = isEmployee;
    _userRole = role?.toLowerCase();
    
    // Auto-set admin/gm mode based on role
    if (_userRole == 'admin') {
      _isAdminMode = true;
      _isGmMode = true; // Admin has all GM permissions
    } else if (_userRole == 'gm') {
      _isGmMode = true;
      _isAdminMode = false;
    } else {
      _isAdminMode = false;
      _isGmMode = false;
    }
    
    notifyListeners();
  }

  /// Clear all role flags (on logout)
  void clearRoles() {
    _isEmployee = false;
    _userRole = null;
    _isAdminMode = false;
    _isGmMode = false;
    notifyListeners();
  }
}
