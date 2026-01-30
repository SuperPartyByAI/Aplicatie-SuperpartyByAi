// Single source of truth for admin phone. Inbox Admin = only this; Inbox Angajați = all others.

const String adminPhone = '0737571397';

/// Normalize phone to digits only. Handles +40..., 0..., 407...
String normalizePhone(String? input) {
  if (input == null || input.isEmpty) return '';
  final digits = input.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '';
  if (digits.startsWith('0') && digits.length == 10) return '4$digits';
  if (digits.startsWith('40') && digits.length == 11) return digits;
  if (digits.startsWith('4') && digits.length == 11) return digits;
  return digits;
}

/// True if [phone] matches admin phone (0737571397 / +40737571397).
bool isAdminPhone(String? phone) {
  final n = normalizePhone(phone);
  final a = normalizePhone(adminPhone);
  if (n.isEmpty || a.isEmpty) return false;
  if (n == a) return true;
  if (a.length >= 9 && n.length >= 9) {
    return n.substring(n.length - 9) == a.substring(a.length - 9);
  }
  return false;
}
