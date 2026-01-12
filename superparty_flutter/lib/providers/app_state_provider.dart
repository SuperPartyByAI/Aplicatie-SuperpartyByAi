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
    if (_isGridOpen) return; // Early return if already open
    _isGridOpen = true;
    notifyListeners();
  }

  void closeGrid() {
    if (!_isGridOpen) return; // Early return if already closed
    _isGridOpen = false;
    notifyListeners();
  }

  void setAdminMode(bool value) {
    if (_isAdminMode == value) return; // Early return if value didn't change
    _isAdminMode = value;
    notifyListeners();
  }

  void setGmMode(bool value) {
    if (_isGmMode == value) return; // Early return if value didn't change
    _isGmMode = value;
    notifyListeners();
  }

  void exitAdminMode() {
    if (!_isAdminMode) return; // Early return if already exited
    _isAdminMode = false;
    notifyListeners();
  }

  void exitGmMode() {
    if (!_isGmMode) return; // Early return if already exited
    _isGmMode = false;
    notifyListeners();
  }

  /// Set employee status and role from staffProfiles
  /// Early returns without notifyListeners() if values didn't change to prevent rebuild loops
  void setEmployeeStatus(bool isEmployee, String? role) {
    final newRole = role?.toLowerCase();
    
    // Calculate new admin/gm flags
    bool newIsAdmin = false;
    bool newIsGm = false;
    if (newRole == 'admin') {
      newIsAdmin = true;
      newIsGm = true; // Admin has all GM permissions
    } else if (newRole == 'gm') {
      newIsGm = true;
      newIsAdmin = false;
    }
    
    // CRITICAL: Early return if nothing changed to prevent rebuild loops
    if (_isEmployee == isEmployee &&
        _userRole == newRole &&
        _isAdminMode == newIsAdmin &&
        _isGmMode == newIsGm) {
      return; // Skip notifyListeners() if nothing changed
    }
    
    // Update state only if values actually changed
    _isEmployee = isEmployee;
    _userRole = newRole;
    _isAdminMode = newIsAdmin;
    _isGmMode = newIsGm;
    
    notifyListeners();
  }

  /// Clear all role flags (on logout)
  /// Early returns without notifyListeners() if already cleared to prevent rebuild loops
  void clearRoles() {
    // CRITICAL: Early return if already cleared to prevent rebuild loops
    if (!_isEmployee && _userRole == null && !_isAdminMode && !_isGmMode) {
      return; // Skip notifyListeners() if nothing changed
    }
    
    _isEmployee = false;
    _userRole = null;
    _isAdminMode = false;
    _isGmMode = false;
    notifyListeners();
  }
}
