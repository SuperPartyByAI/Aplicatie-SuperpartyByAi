import 'package:flutter/foundation.dart';

class AppStateProvider extends ChangeNotifier {
  bool _isGridOpen = false;
  bool _isAdminMode = false;
  bool _isGmMode = false;

  bool get isGridOpen => _isGridOpen;
  bool get isAdminMode => _isAdminMode;
  bool get isGmMode => _isGmMode;

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
}
