'use strict';

/**
 * Role-Specific Logic V3
 * 
 * Handles special cases for Animator and Ursitoare
 */

const { allocateSlot } = require('./eventOperations_v3');
const { createPendingPersonajTask } = require('./tasksManager_v3');

/**
 * Process Animator role
 * If character is unknown, create pending task
 */
async function processAnimatorRole(eventId, eventShortId, roleData, eventData, rolesBySlot) {
  const character = roleData.details?.character || roleData.character || null;
  
  const slot = allocateSlot(eventShortId, rolesBySlot);
  
  const role = {
    slot,
    roleType: 'ANIMATOR',
    label: roleData.label || 'Animator',
    startTime: roleData.startTime || roleData.time || null,
    durationMin: roleData.durationMin || roleData.duration || 120,
    status: character ? 'PENDING' : 'PENDING_PERSONAJ',
    details: {
      character: character || null,
      childName: roleData.details?.childName || eventData.childName || null,
      childAge: roleData.details?.childAge || eventData.childAge || null,
      numChildren: roleData.details?.numChildren || eventData.numChildren || null,
    },
    assigneeUid: null,
    assigneeCode: null,
    assignedCode: null,
    pendingCode: null,
    note: null,
    resources: [],
  };
  
  // If character is unknown, create task
  if (!character) {
    await createPendingPersonajTask(eventId, eventShortId, slot, eventData);
  }
  
  return { slot, role };
}

/**
 * Process Ursitoare roles
 * Creates 3 or 4 roles (3 good + optional 1 bad)
 */
async function processUrsitoareRoles(eventShortId, roleData, rolesBySlot) {
  const numUrsitoare = roleData.numUrsitoare || roleData.count || 3;
  const includeRea = numUrsitoare === 4;
  
  const startTime = roleData.startTime || roleData.time || null;
  const roles = [];
  
  // Create 3 or 4 roles with consecutive slots
  for (let i = 0; i < numUrsitoare; i++) {
    const slot = allocateSlot(eventShortId, { ...rolesBySlot, ...Object.fromEntries(roles.map(r => [r.slot, r.role])) });
    
    const isRea = includeRea && i === numUrsitoare - 1;
    
    const role = {
      slot,
      roleType: 'URSITOARE',
      label: isRea ? 'Ursitoare Rea' : `Ursitoare ${i + 1}`,
      startTime,
      durationMin: 60, // Fixed 60 min
      status: 'PENDING',
      details: {
        isRea,
        position: i + 1,
      },
      assigneeUid: null,
      assigneeCode: null,
      assignedCode: null,
      pendingCode: null,
      note: null,
      resources: [],
    };
    
    roles.push({ slot, role });
  }
  
  return roles;
}

module.exports = {
  processAnimatorRole,
  processUrsitoareRoles,
};
