/**
 * Create ursitoare roles (3 good or 3 good + 1 bad)
 * 
 * Rules:
 * - "3 ursitoare" = 3 good
 * - "4 ursitoare" = 3 good + 1 bad
 * - All have same startTime
 * - All have duration 60 minutes (fixed)
 * - Consecutive slots (01B, 01C, 01D, 01E)
 * 
 * @param {number} count - 3 or 4
 * @param {string} startTime - HH:mm format
 * @param {string} eventShortId - Event short ID (01, 02, etc)
 * @param {Array<string>} existingSlots - Existing slots to avoid
 * @returns {Array<Object>} - Array of role objects
 */
function createUrsitoareRoles(count, startTime, eventShortId, existingSlots = []) {
  if (count !== 3 && count !== 4) {
    throw new Error('Ursitoare count must be 3 or 4');
  }

  const roles = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = String(eventShortId).padStart(2, '0');

  // Find first available letter
  let letterIndex = 0;
  while (existingSlots.includes(`${prefix}${letters[letterIndex]}`)) {
    letterIndex++;
  }

  // Create 3 good ursitoare
  for (let i = 0; i < 3; i++) {
    const slot = `${prefix}${letters[letterIndex + i]}`;
    roles.push({
      slot,
      roleType: 'ursitoare_buna',
      label: `Ursitoare Bună ${i + 1}`,
      startTime,
      durationMin: 60, // Fixed duration
      status: 'active',
      assigneeUid: null,
      assigneeCode: null,
      assignedCode: null,
      pendingCode: null,
      details: {
        tip: 'buna',
        numar: count,
      },
      pending: null,
      notes: null,
      checklist: [],
      resources: [],
      isArchived: false,
    });
  }

  // If 4, add 1 bad ursitoare
  if (count === 4) {
    const slot = `${prefix}${letters[letterIndex + 3]}`;
    roles.push({
      slot,
      roleType: 'ursitoare_rea',
      label: 'Ursitoare Rea',
      startTime,
      durationMin: 60, // Fixed duration
      status: 'active',
      assigneeUid: null,
      assigneeCode: null,
      assignedCode: null,
      pendingCode: null,
      details: {
        tip: 'rea',
        numar: count,
      },
      pending: null,
      notes: null,
      checklist: [],
      resources: [],
      isArchived: false,
    });
  }

  return roles;
}

module.exports = {
  createUrsitoareRoles,
};
