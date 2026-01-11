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

    // Check if anything actually changed
    final noChange = _isEmployee == isEmployee &&
        _userRole == newRole &&
        _isAdminMode == newIsAdmin &&
        _isGmMode == newIsGm;

    if (noChange) return; // Skip notifyListeners if nothing changed

    // Update state
    _isEmployee = isEmployee;
    _userRole = newRole;
    _isAdminMode = newIsAdmin;
    _isGmMode = newIsGm;

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
