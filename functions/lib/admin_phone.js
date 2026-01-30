'use strict';

/**
 * Single source of truth for admin phone. Used to split Inbox Admin vs Inbox Angajați.
 * Inbox Admin = only this phone; Inbox Angajați = all others.
 */
const ADMIN_PHONE = '0737571397';

/**
 * Normalize phone to digits only for comparison. Handles +40..., 0..., 407...
 * Use last 9–10 digits for Romanian numbers (0737571397 <-> +40737571397).
 */
function normalizePhone(input) {
  if (!input || typeof input !== 'string') return '';
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.startsWith('0') && digits.length === 10) return '4' + digits;
  if (digits.startsWith('40') && digits.length === 11) return digits;
  if (digits.startsWith('4') && digits.length === 11) return digits;
  return digits;
}

function isAdminPhone(phone) {
  const n = normalizePhone(phone);
  const a = normalizePhone(ADMIN_PHONE);
  if (!n || !a) return false;
  if (n === a) return true;
  if (a.length >= 9 && n.length >= 9) return n.slice(-9) === a.slice(-9);
  return false;
}

module.exports = { ADMIN_PHONE, normalizePhone, isAdminPhone };
