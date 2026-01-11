/**
 * normalizers.js
 * 
 * Centralized normalization utilities for V3 EN schema.
 * Handles backward compatibility with v1/v2 RO fields.
 */

/**
 * Normalize event fields from RO/mixed to EN V3
 * @param {object} input - Raw event data (may contain RO or EN fields)
 * @returns {object} - Normalized V3 EN event data
 */
function normalizeEventFields(input) {
  if (!input) return {};

  const normalized = {};

  // eventShortId (numeric) - priority: eventShortId > numarEveniment (parse to number)
  if (typeof input.eventShortId === 'number') {
    normalized.eventShortId = input.eventShortId;
  } else if (typeof input.numarEveniment === 'string') {
    normalized.eventShortId = parseInt(input.numarEveniment, 10) || 0;
  } else if (typeof input.numarEveniment === 'number') {
    normalized.eventShortId = input.numarEveniment;
  }

  // date (EN) - priority: date > data
  normalized.date = input.date || input.data || null;

  // address (EN) - priority: address > adresa
  normalized.address = input.address || input.adresa || null;

  // phoneE164 (EN) - priority: phoneE164 > telefonClientE164
  normalized.phoneE164 = input.phoneE164 || input.telefonClientE164 || null;

  // phoneRaw (EN) - priority: phoneRaw > telefonClientRaw
  normalized.phoneRaw = input.phoneRaw || input.telefonClientRaw || null;

  // childName (EN) - priority: childName > sarbatoritNume
  normalized.childName = input.childName || input.sarbatoritNume || null;

  // childAge (EN) - priority: childAge > sarbatoritVarsta
  normalized.childAge = input.childAge || input.sarbatoritVarsta || null;

  // childDob (EN) - priority: childDob > sarbatoritDataNastere
  normalized.childDob = input.childDob || input.sarbatoritDataNastere || null;

  // parentName (EN) - priority: parentName > numeParinte
  normalized.parentName = input.parentName || input.numeParinte || null;

  // parentPhone (EN) - priority: parentPhone > telefonParinte
  normalized.parentPhone = input.parentPhone || input.telefonParinte || null;

  // numChildren (EN) - priority: numChildren > nrCopiiAprox
  normalized.numChildren = input.numChildren || input.nrCopiiAprox || null;

  // rolesBySlot (EN) - priority: rolesBySlot > roluriPeSlot > roles[]
  if (input.rolesBySlot) {
    normalized.rolesBySlot = input.rolesBySlot;
  } else if (input.roluriPeSlot) {
    normalized.rolesBySlot = input.roluriPeSlot;
  } else if (Array.isArray(input.roles)) {
    // Convert roles[] to rolesBySlot (legacy v1/v2)
    normalized.rolesBySlot = {};
    input.roles.forEach((role, index) => {
      const slot = `slot${index + 1}`;
      normalized.rolesBySlot[slot] = normalizeRoleFields(role);
    });
  } else {
    normalized.rolesBySlot = {};
  }

  // payment (EN) - priority: payment > incasare
  if (input.payment) {
    normalized.payment = {
      status: input.payment.status || input.payment.stare || 'UNPAID',
      method: input.payment.method || input.payment.metoda || null,
      amount: input.payment.amount || input.payment.suma || 0,
    };
  } else if (input.incasare) {
    normalized.payment = {
      status: input.incasare.stare === 'NEINCASAT' ? 'UNPAID' : (input.incasare.stare || 'UNPAID'),
      method: input.incasare.metoda || null,
      amount: input.incasare.suma || 0,
    };
  } else {
    normalized.payment = {
      status: 'UNPAID',
      method: null,
      amount: 0,
    };
  }

  // isArchived (EN) - priority: isArchived > esteArhivat
  normalized.isArchived = input.isArchived !== undefined ? input.isArchived : (input.esteArhivat || false);

  // archivedAt (EN) - priority: archivedAt > arhivatLa
  normalized.archivedAt = input.archivedAt || input.arhivatLa || null;

  // archivedBy (EN) - priority: archivedBy > arhivatDe
  normalized.archivedBy = input.archivedBy || input.arhivatDe || null;

  // archiveReason (EN) - priority: archiveReason > motivArhivare
  normalized.archiveReason = input.archiveReason || input.motivArhivare || null;

  // notedByCode (EN) - priority: notedByCode > notatDeCod
  normalized.notedByCode = input.notedByCode || input.notatDeCod || null;

  // createdAt (EN) - priority: createdAt > creatLa
  normalized.createdAt = input.createdAt || input.creatLa || null;

  // createdBy (EN) - priority: createdBy > creatDe
  normalized.createdBy = input.createdBy || input.creatDe || null;

  // updatedAt (EN) - priority: updatedAt > actualizatLa
  normalized.updatedAt = input.updatedAt || input.actualizatLa || null;

  // updatedBy (EN) - priority: updatedBy > actualizatDe
  normalized.updatedBy = input.updatedBy || input.actualizatDe || null;

  // clientRequestId (EN) - no RO equivalent
  normalized.clientRequestId = input.clientRequestId || null;

  // schemaVersion (EN) - priority: schemaVersion > versiuneSchema
  normalized.schemaVersion = input.schemaVersion || input.versiuneSchema || 3;

  return normalized;
}

/**
 * Normalize role fields from RO/mixed to EN V3
 * @param {object} input - Raw role data (may contain RO or EN fields)
 * @returns {object} - Normalized V3 EN role data
 */
function normalizeRoleFields(input) {
  if (!input) return {};

  const normalized = {};

  // slot (EN) - no RO equivalent
  normalized.slot = input.slot || null;

  // roleType (EN) - priority: roleType > cheieRol > tip
  normalized.roleType = input.roleType || input.cheieRol || input.tip || null;

  // label (EN) - priority: label > eticheta
  normalized.label = input.label || input.eticheta || null;

  // startTime (EN) - priority: startTime > oraStart > ora
  normalized.startTime = input.startTime || input.oraStart || input.ora || null;

  // durationMin (EN) - priority: durationMin > durataMin
  normalized.durationMin = input.durationMin || input.durataMin || null;

  // status (EN) - priority: status > stare
  normalized.status = input.status || input.stare || 'PENDING';

  // assigneeUid (EN) - priority: assigneeUid > asignatUid
  normalized.assigneeUid = input.assigneeUid || input.asignatUid || null;

  // assigneeCode (EN) - priority: assigneeCode > asignatCod
  normalized.assigneeCode = input.assigneeCode || input.asignatCod || null;

  // assignedCode (EN) - priority: assignedCode > codAtribuit
  normalized.assignedCode = input.assignedCode || input.codAtribuit || null;

  // pendingCode (EN) - priority: pendingCode > codInAsteptare
  normalized.pendingCode = input.pendingCode || input.codInAsteptare || null;

  // details (EN) - priority: details > detalii
  if (input.details) {
    normalized.details = input.details;
  } else if (input.detalii) {
    normalized.details = input.detalii;
  } else {
    normalized.details = {};
  }

  // note (EN) - priority: note > nota
  normalized.note = input.note || input.nota || null;

  // resources (EN) - priority: resources > resurse
  if (input.resources) {
    normalized.resources = input.resources;
  } else if (input.resurse) {
    normalized.resources = input.resurse;
  } else {
    normalized.resources = [];
  }

  return normalized;
}

/**
 * Role synonyms mapping (RO + EN + variations)
 * Maps user input → canonical roleType
 */
const ROLE_SYNONYMS = {
  // Animator
  'animator': 'ANIMATOR',
  'animatori': 'ANIMATOR',
  'animatoare': 'ANIMATOR',
  'animatoare petrecere': 'ANIMATOR',
  'animator copii': 'ANIMATOR',
  'entertainer': 'ANIMATOR',

  // Ursitoare
  'ursitoare': 'URSITOARE',
  'ursitoarea': 'URSITOARE',
  'ursitori': 'URSITOARE',
  'ursitoarea buna': 'URSITOARE',
  'ursitoarea rea': 'URSITOARE',
  'fairy godmother': 'URSITOARE',

  // Arcadă
  'arcada': 'ARCADE',
  'arcadă': 'ARCADE',
  'arcade': 'ARCADE',
  'jocuri arcade': 'ARCADE',
  'arcade games': 'ARCADE',
  'masini arcade': 'ARCADE',

  // Baloane
  'baloane': 'BALLOONS',
  'balon': 'BALLOONS',
  'balloons': 'BALLOONS',
  'balloon': 'BALLOONS',
  'baloane decorative': 'BALLOONS',
  'decoratiuni baloane': 'BALLOONS',

  // Vată de zahăr
  'vata de zahar': 'COTTON_CANDY',
  'vată de zahăr': 'COTTON_CANDY',
  'vata zahar': 'COTTON_CANDY',
  'cotton candy': 'COTTON_CANDY',
  'candy floss': 'COTTON_CANDY',
  'sugar cotton': 'COTTON_CANDY',

  // Popcorn
  'popcorn': 'POPCORN',
  'pop corn': 'POPCORN',
  'floricele': 'POPCORN',
  'porumb prajit': 'POPCORN',
  'porumb prăjit': 'POPCORN',

  // Decorațiuni
  'decoratiuni': 'DECORATIONS',
  'decorațiuni': 'DECORATIONS',
  'decorations': 'DECORATIONS',
  'decor': 'DECORATIONS',
  'decorare': 'DECORATIONS',
  'decorare petrecere': 'DECORATIONS',
  'party decorations': 'DECORATIONS',

  // Baloane cu heliu
  'baloane heliu': 'HELIUM_BALLOONS',
  'baloane cu heliu': 'HELIUM_BALLOONS',
  'helium balloons': 'HELIUM_BALLOONS',
  'baloane zburatoare': 'HELIUM_BALLOONS',
  'baloane cu gaz': 'HELIUM_BALLOONS',

  // Moș Crăciun
  'mos craciun': 'SANTA_CLAUS',
  'moș crăciun': 'SANTA_CLAUS',
  'santa': 'SANTA_CLAUS',
  'santa claus': 'SANTA_CLAUS',
  'mosul': 'SANTA_CLAUS',
  'father christmas': 'SANTA_CLAUS',

  // Gheață carbonică
  'gheata carbonica': 'DRY_ICE',
  'gheață carbonică': 'DRY_ICE',
  'dry ice': 'DRY_ICE',
  'fum greu': 'DRY_ICE',
  'efect fum': 'DRY_ICE',
  'fum artificial': 'DRY_ICE',
};

/**
 * Normalize role type from user input (synonym) to canonical roleType
 * @param {string} input - User input (e.g., "arcada", "vată de zahăr")
 * @returns {string|null} - Canonical roleType (e.g., "ARCADE", "COTTON_CANDY") or null
 */
function normalizeRoleType(input) {
  if (!input || typeof input !== 'string') return null;

  const normalized = input.toLowerCase().trim();
  return ROLE_SYNONYMS[normalized] || null;
}

/**
 * Get all synonyms for a canonical roleType
 * @param {string} roleType - Canonical roleType (e.g., "ARCADE")
 * @returns {string[]} - Array of synonyms
 */
function getRoleSynonyms(roleType) {
  return Object.keys(ROLE_SYNONYMS).filter(key => ROLE_SYNONYMS[key] === roleType);
}

/**
 * Role-specific field requirements
 */
const ROLE_REQUIREMENTS = {
  ANIMATOR: {
    requiredFields: ['startTime', 'durationMin'],
    optionalFields: ['childName', 'childAge', 'character', 'numChildren'],
    defaultDuration: 120,
    confirmationMessage: 'Animator rezervat pentru {startTime}, durată {durationMin} min.',
  },
  URSITOARE: {
    requiredFields: ['startTime'],
    optionalFields: ['numUrsitoare', 'includeRea'],
    defaultDuration: 60,
    confirmationMessage: 'Ursitoare rezervate pentru {startTime}, durată 60 min.',
  },
  ARCADE: {
    requiredFields: ['startTime', 'durationMin'],
    optionalFields: ['numMachines', 'machineTypes'],
    defaultDuration: 180,
    confirmationMessage: 'Arcadă rezervată pentru {startTime}, durată {durationMin} min.',
  },
  BALLOONS: {
    requiredFields: [],
    optionalFields: ['quantity', 'colors', 'arrangement'],
    defaultDuration: null,
    confirmationMessage: 'Baloane rezervate.',
  },
  COTTON_CANDY: {
    requiredFields: ['startTime', 'durationMin'],
    optionalFields: ['quantity', 'flavors'],
    defaultDuration: 120,
    confirmationMessage: 'Vată de zahăr rezervată pentru {startTime}, durată {durationMin} min.',
  },
  POPCORN: {
    requiredFields: ['startTime', 'durationMin'],
    optionalFields: ['quantity', 'flavors'],
    defaultDuration: 120,
    confirmationMessage: 'Popcorn rezervat pentru {startTime}, durată {durationMin} min.',
  },
  DECORATIONS: {
    requiredFields: [],
    optionalFields: ['theme', 'colors', 'items'],
    defaultDuration: null,
    confirmationMessage: 'Decorațiuni rezervate.',
  },
  HELIUM_BALLOONS: {
    requiredFields: [],
    optionalFields: ['quantity', 'colors', 'shapes'],
    defaultDuration: null,
    confirmationMessage: 'Baloane cu heliu rezervate.',
  },
  SANTA_CLAUS: {
    requiredFields: ['startTime', 'durationMin'],
    optionalFields: ['numChildren', 'gifts'],
    defaultDuration: 60,
    confirmationMessage: 'Moș Crăciun rezervat pentru {startTime}, durată {durationMin} min.',
  },
  DRY_ICE: {
    requiredFields: ['startTime'],
    optionalFields: ['quantity', 'duration'],
    defaultDuration: null,
    confirmationMessage: 'Gheață carbonică rezervată pentru {startTime}.',
  },
};

/**
 * Get role requirements by roleType
 * @param {string} roleType - Canonical roleType
 * @returns {object|null} - Role requirements or null
 */
function getRoleRequirements(roleType) {
  return ROLE_REQUIREMENTS[roleType] || null;
}

module.exports = {
  normalizeEventFields,
  normalizeRoleFields,
  normalizeRoleType,
  getRoleSynonyms,
  getRoleRequirements,
  ROLE_SYNONYMS,
  ROLE_REQUIREMENTS,
};
