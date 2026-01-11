'use strict';

/**
 * v3 Validators - Determinist, fără LLM
 * Validări stricte pentru schema v3
 */

/**
 * Validează dată DD-MM-YYYY
 */
function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { valid: false, error: 'Date required (DD-MM-YYYY)' };
  }

  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) {
    return { valid: false, error: 'Invalid format. Use DD-MM-YYYY' };
  }

  const [, day, month, year] = match;
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  if (m < 1 || m > 12) {
    return { valid: false, error: 'Invalid month' };
  }

  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) {
    return { valid: false, error: 'Invalid day for month' };
  }

  return { valid: true, date: new Date(y, m - 1, d) };
}

/**
 * Validează oră HH:mm
 */
function validateTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return { valid: false, error: 'Time required (HH:mm)' };
  }

  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return { valid: false, error: 'Invalid format. Use HH:mm' };
  }

  const [, hour, minute] = match;
  const h = parseInt(hour, 10);
  const min = parseInt(minute, 10);

  if (h < 0 || h > 23) {
    return { valid: false, error: 'Invalid hour (0-23)' };
  }

  if (min < 0 || min > 59) {
    return { valid: false, error: 'Invalid minute (0-59)' };
  }

  return { valid: true, hour: h, minute: min };
}

/**
 * Validează durată (minutes)
 */
function validateDuration(durationMin) {
  if (typeof durationMin !== 'number' || durationMin <= 0) {
    return { valid: false, error: 'Duration must be positive number (minutes)' };
  }

  if (durationMin > 480) {
    return { valid: false, error: 'Duration too long (max 8 hours)' };
  }

  return { valid: true, durationMin };
}

/**
 * Validează telefon E.164
 */
function validatePhone(phoneE164, phoneRaw) {
  if (!phoneE164 || typeof phoneE164 !== 'string') {
    return { valid: false, error: 'Phone E.164 required' };
  }

  if (!phoneE164.startsWith('+')) {
    return { valid: false, error: 'Phone must start with +' };
  }

  if (phoneE164.length < 10 || phoneE164.length > 15) {
    return { valid: false, error: 'Phone length invalid' };
  }

  return { valid: true, phoneE164, phoneRaw: phoneRaw || phoneE164 };
}

/**
 * Validează event v3 complet
 */
function validateEventV3(eventData) {
  const errors = [];

  // Date
  const dateCheck = validateDate(eventData.date);
  if (!dateCheck.valid) {
    errors.push(`date: ${dateCheck.error}`);
  }

  // Address
  if (!eventData.address || eventData.address.trim().length < 5) {
    errors.push('address: Required (min 5 chars)');
  }

  // Phone
  const phoneCheck = validatePhone(eventData.phoneE164, eventData.phoneRaw);
  if (!phoneCheck.valid) {
    errors.push(`phone: ${phoneCheck.error}`);
  }

  // eventShortId
  if (typeof eventData.eventShortId !== 'number' || eventData.eventShortId < 1) {
    errors.push('eventShortId: Must be positive number');
  }

  // rolesBySlot
  if (!eventData.rolesBySlot || typeof eventData.rolesBySlot !== 'object') {
    errors.push('rolesBySlot: Required (map)');
  } else {
    // Validate each role
    Object.entries(eventData.rolesBySlot).forEach(([slot, role]) => {
      const roleErrors = validateRoleV3(role, slot);
      if (roleErrors.length > 0) {
        errors.push(`role ${slot}: ${roleErrors.join(', ')}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validează role v3
 */
function validateRoleV3(roleData, expectedSlot) {
  const errors = [];

  // Slot
  if (roleData.slot !== expectedSlot) {
    errors.push(`slot mismatch (expected ${expectedSlot}, got ${roleData.slot})`);
  }

  // roleType
  if (!roleData.roleType || typeof roleData.roleType !== 'string') {
    errors.push('roleType required');
  }

  // startTime
  const timeCheck = validateTime(roleData.startTime);
  if (!timeCheck.valid) {
    errors.push(`startTime: ${timeCheck.error}`);
  }

  // durationMin
  const durationCheck = validateDuration(roleData.durationMin);
  if (!durationCheck.valid) {
    errors.push(`durationMin: ${durationCheck.error}`);
  }

  // status
  const validStatuses = ['active', 'archived', 'assigned', 'done', 'canceled'];
  if (!validStatuses.includes(roleData.status)) {
    errors.push(`status: Must be one of ${validStatuses.join(', ')}`);
  }

  return errors;
}

module.exports = {
  validateDate,
  validateTime,
  validateDuration,
  validatePhone,
  validateEventV3,
  validateRoleV3,
};
