'use strict';

/**
 * Event Operations V3 - Complete CRUD with Audit
 * 
 * All operations write ONLY V3 canonical fields
 * Includes history logging and slot allocation
 */

const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const { normalizeEventFields, normalizeRoleFields } = require('./normalizers');
const { getNextEventShortId } = require('./shortCodeGenerator');

const db = admin.firestore();

/**
 * Allocate next free slot for event
 * NEVER reuses slots (includes archived roles)
 */
function allocateSlot(eventShortId, existingRolesBySlot) {
  const prefix = String(eventShortId).padStart(2, '0');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  const usedLetters = new Set();
  Object.keys(existingRolesBySlot || {}).forEach(slot => {
    const letter = slot.replace(prefix, '');
    if (letter) usedLetters.add(letter);
  });
  
  for (let i = 0; i < alphabet.length; i++) {
    const letter = alphabet[i];
    if (!usedLetters.has(letter)) {
      return `${prefix}${letter}`;
    }
  }
  
  throw new Error('Maximum 26 roles per event reached');
}

/**
 * Create event (V3 only)
 */
async function createEvent(data, userContext) {
  const { uid, email, staffCode } = userContext;
  
  // Normalize input
  const normalized = normalizeEventFields(data);
  
  // Validate required fields
  if (!normalized.date) {
    throw new Error('date is required (format: DD-MM-YYYY)');
  }
  if (!normalized.address) {
    throw new Error('address is required');
  }
  
  // Generate eventShortId
  const eventShortId = await getNextEventShortId();
  
  // Convert roles if provided
  let rolesBySlot = normalized.rolesBySlot || {};
  if (Array.isArray(data.roles) && data.roles.length > 0) {
    rolesBySlot = {};
    for (let i = 0; i < data.roles.length; i++) {
      const slot = allocateSlot(eventShortId, rolesBySlot);
      rolesBySlot[slot] = normalizeRoleFields(data.roles[i]);
      rolesBySlot[slot].slot = slot;
    }
  }
  
  const now = Timestamp.now();
  
  const eventDoc = {
    schemaVersion: 3,
    eventShortId,
    date: normalized.date,
    address: normalized.address,
    phoneE164: normalized.phoneE164 || null,
    phoneRaw: normalized.phoneRaw || null,
    childName: normalized.childName || null,
    childAge: normalized.childAge || 0,
    childDob: normalized.childDob || null,
    parentName: normalized.parentName || null,
    parentPhone: normalized.parentPhone || null,
    numChildren: normalized.numChildren || null,
    rolesBySlot,
    payment: normalized.payment || {
      status: 'UNPAID',
      method: null,
      amount: 0,
    },
    isArchived: false,
    notedByCode: staffCode || null,
    createdAt: now,
    createdBy: uid,
    createdByEmail: email || null,
    updatedAt: now,
    updatedBy: uid,
    clientRequestId: data.clientRequestId || null,
  };
  
  const eventRef = await db.collection('evenimente').add(eventDoc);
  
  // Log creation in history
  await db.collection('evenimente').doc(eventRef.id).collection('history').add({
    type: 'DATA_CHANGE',
    timestamp: now,
    action: 'CREATE_EVENT',
    eventShortId,
    roleSlots: Object.keys(rolesBySlot),
    before: {},
    after: { schemaVersion: 3, eventShortId },
    sourceMessageIds: data.sourceMessageIds || [],
  });
  
  return {
    id: eventRef.id,
    ...eventDoc,
  };
}

/**
 * Add role to event
 */
async function addRole(eventId, roleData, userContext) {
  const { uid, staffCode } = userContext;
  
  const eventRef = db.collection('evenimente').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }
  
  const eventData = eventDoc.data();
  const eventShortId = eventData.eventShortId;
  
  if (!eventShortId) {
    throw new Error('Event missing eventShortId (not v3?)');
  }
  
  // Allocate slot
  const rolesBySlot = eventData.rolesBySlot || {};
  const slot = allocateSlot(eventShortId, rolesBySlot);
  
  // Normalize role
  const role = normalizeRoleFields(roleData);
  role.slot = slot;
  
  // Update event
  rolesBySlot[slot] = role;
  
  const now = Timestamp.now();
  
  await eventRef.update({
    rolesBySlot,
    updatedAt: now,
    updatedBy: uid,
  });
  
  // Log in history
  await eventRef.collection('history').add({
    type: 'DATA_CHANGE',
    timestamp: now,
    action: 'ADD_ROLE',
    eventShortId,
    roleSlots: [slot],
    before: {},
    after: { [slot]: role },
    sourceMessageIds: roleData.sourceMessageIds || [],
  });
  
  return role;
}

/**
 * Update role
 */
async function updateRole(eventId, slot, updates, userContext) {
  const { uid } = userContext;
  
  const eventRef = db.collection('evenimente').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }
  
  const eventData = eventDoc.data();
  const rolesBySlot = eventData.rolesBySlot || {};
  
  if (!rolesBySlot[slot]) {
    throw new Error(`Role ${slot} not found`);
  }
  
  const before = { ...rolesBySlot[slot] };
  
  // Normalize updates
  const normalizedUpdates = normalizeRoleFields(updates);
  
  // Merge updates
  rolesBySlot[slot] = {
    ...rolesBySlot[slot],
    ...normalizedUpdates,
    slot, // Preserve slot
  };
  
  const now = Timestamp.now();
  
  await eventRef.update({
    rolesBySlot,
    updatedAt: now,
    updatedBy: uid,
  });
  
  // Log in history
  await eventRef.collection('history').add({
    type: 'DATA_CHANGE',
    timestamp: now,
    action: 'UPDATE_ROLE',
    eventShortId: eventData.eventShortId,
    roleSlots: [slot],
    before: { [slot]: before },
    after: { [slot]: rolesBySlot[slot] },
    sourceMessageIds: updates.sourceMessageIds || [],
  });
  
  return rolesBySlot[slot];
}

/**
 * Archive role (NOT delete)
 */
async function archiveRole(eventId, slot, reason, userContext) {
  const { uid } = userContext;
  
  const eventRef = db.collection('evenimente').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }
  
  const eventData = eventDoc.data();
  const rolesBySlot = eventData.rolesBySlot || {};
  
  if (!rolesBySlot[slot]) {
    throw new Error(`Role ${slot} not found`);
  }
  
  const before = { ...rolesBySlot[slot] };
  
  const now = Timestamp.now();
  
  // Update role status to archived
  rolesBySlot[slot] = {
    ...rolesBySlot[slot],
    status: 'ARCHIVED',
    archivedAt: now,
    archivedBy: uid,
    archiveReason: reason || null,
  };
  
  await eventRef.update({
    rolesBySlot,
    updatedAt: now,
    updatedBy: uid,
  });
  
  // Log in history
  await eventRef.collection('history').add({
    type: 'DATA_CHANGE',
    timestamp: now,
    action: 'ARCHIVE_ROLE',
    eventShortId: eventData.eventShortId,
    roleSlots: [slot],
    before: { [slot]: before },
    after: { [slot]: rolesBySlot[slot] },
    sourceMessageIds: [],
  });
  
  return rolesBySlot[slot];
}

/**
 * Archive event (NOT delete)
 */
async function archiveEvent(eventId, reason, userContext) {
  const { uid } = userContext;
  
  const eventRef = db.collection('evenimente').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }
  
  const eventData = eventDoc.data();
  const now = Timestamp.now();
  
  await eventRef.update({
    isArchived: true,
    archivedAt: now,
    archivedBy: uid,
    archiveReason: reason || null,
    updatedAt: now,
    updatedBy: uid,
  });
  
  // Log in history
  await eventRef.collection('history').add({
    type: 'DATA_CHANGE',
    timestamp: now,
    action: 'ARCHIVE_EVENT',
    eventShortId: eventData.eventShortId,
    roleSlots: [],
    before: { isArchived: false },
    after: { isArchived: true },
    sourceMessageIds: [],
  });
  
  return {
    id: eventId,
    isArchived: true,
    archivedAt: now,
  };
}

/**
 * Find future events by phone
 */
async function findFutureEventsByPhone(phoneE164) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const snapshot = await db.collection('evenimente')
    .where('phoneE164', '==', phoneE164)
    .where('isArchived', '==', false)
    .get();
  
  const events = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const key = data.dateKey || null;
    if (key && typeof key === 'string' && key >= todayKey) {
      events.push({
        id: doc.id,
        ...data,
      });
      return;
    }
    // Fallback for legacy docs without dateKey (best-effort, old string compare)
    if (data.date && typeof data.date === 'string') {
      events.push({
        id: doc.id,
        ...data,
      });
    }
  });
  // Filter legacy by parsing DD-MM-YYYY if possible
  const filtered = events.filter(e => {
    if (e.dateKey) return true;
    const s = String(e.date || '');
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    if (!m) return false;
    const k = `${m[3]}-${m[2]}-${m[1]}`;
    return k >= todayKey;
  });

  return filtered;
}

module.exports = {
  createEvent,
  addRole,
  updateRole,
  archiveRole,
  archiveEvent,
  findFutureEventsByPhone,
  allocateSlot,
};
