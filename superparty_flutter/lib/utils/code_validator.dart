/// Validare coduri staff și șofer conform spec
class CodeValidator {
  /// Validează cod staff (A1-A50 ... J1-J50 + ATRAINER ... JTRAINER)
  static bool isValidStaffCode(String? code) {
    if (code == null || code.isEmpty) return false;

    final normalized = code.trim().toUpperCase();

    // Verifică format XTRAINER (X = A-J)
    if (normalized.endsWith('TRAINER')) {
      final prefix = normalized.substring(0, normalized.length - 7);
      return _isValidSlot(prefix);
    }

    // Verifică format X1-X50 (X = A-J)
    if (normalized.length >= 2) {
      final slot = normalized[0];
      final numberStr = normalized.substring(1);

      if (_isValidSlot(slot)) {
        final number = int.tryParse(numberStr);
        if (number != null && number >= 1 && number <= 50) {
          return true;
        }
      }
    }

    return false;
  }

  /// Validează cod șofer (D1-D50 + DTRAINER)
  static bool isValidDriverCode(String? code) {
    if (code == null || code.isEmpty) return false;

    final normalized = code.trim().toUpperCase();

    // Verifică DTRAINER
    if (normalized == 'DTRAINER') return true;

    // Verifică D1-D50
    if (normalized.startsWith('D') && normalized.length >= 2) {
      final numberStr = normalized.substring(1);
      final number = int.tryParse(numberStr);
      if (number != null && number >= 1 && number <= 50) {
        return true;
      }
    }

    return false;
  }

  /// Verifică dacă slot-ul e valid (A-J)
  static bool _isValidSlot(String slot) {
    if (slot.length != 1) return false;
    final code = slot.codeUnitAt(0);
    return code >= 'A'.codeUnitAt(0) && code <= 'J'.codeUnitAt(0);
  }

  /// Normalizează cod (uppercase, trim)
  static String normalize(String code) {
    return code.trim().toUpperCase();
  }

  /// Extrage slot din cod (A din A1, B din BTRAINER, etc.)
  static String? extractSlot(String? code) {
    if (code == null || code.isEmpty) return null;

    final normalized = normalize(code);
    if (normalized.isEmpty) return null;

    final firstChar = normalized[0];
    if (_isValidSlot(firstChar)) {
      return firstChar;
    }

    return null;
  }
}
