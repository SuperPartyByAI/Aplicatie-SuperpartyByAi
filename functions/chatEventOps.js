'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

// Groq SDK
const Groq = require('groq-sdk');

// v3 modules
const { validateEventV3 } = require('./v3Validators');
const { applyChangeWithAudit, createEventV3, getNextEventShortId } = require('./v3Operations');
const { identifyEventForUpdate, checkRoleExists } = require('./eventIdentification');
const { createPendingPersonajTask } = require('./taskManagement');
const { isAffirmative } = require('./confirmationParser');
const { parseDuration } = require('./durationParser');
const { parseDOB } = require('./dobParser');
const { createUrsitoareRoles } = require('./ursitoareLogic');

// Define secret for GROQ API key
const groqApiKey = defineSecret('GROQ_API_KEY');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

// Super admin email with full access
const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

// Admin emails from environment (comma-separated)
function getAdminEmails() {
  const envEmails = process.env.ADMIN_EMAILS || '';
  return envEmails
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
}

// Require authentication only (no employee check)
function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  }
  return {
    uid: request.auth.uid,
    email: request.auth.token?.email || '',
  };
}

// Check if user is employee (for permission checks)
async function isEmployee(uid, email) {
  const adminEmails = [SUPER_ADMIN_EMAIL, ...getAdminEmails()];
  if (adminEmails.includes(email)) {
    return {
      isEmployee: true,
      role: 'admin',
      isGmOrAdmin: true,
      staffCode: uid,
      isSuperAdmin: true,
    };
  }

  const db = admin.firestore();
  const staffDoc = await db.collection('staffProfiles').doc(uid).get();

  if (!staffDoc.exists) {
    return {
      isEmployee: false,
      role: 'user',
      isGmOrAdmin: false,
      staffCode: null,
      isSuperAdmin: false,
    };
  }

  const staffData = staffDoc.data();
  const role = staffData?.role || 'staff';
  const isGmOrAdmin = ['gm', 'admin'].includes(role.toLowerCase());

  return {
    isEmployee: true,
    role,
    isGmOrAdmin,
    staffCode: staffData?.code || uid,
    isSuperAdmin: false,
  };
}

// Rate limiting: check and increment user's daily event creation quota
async function checkRateLimit(uid) {
  const db = admin.firestore();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const quotaRef = db.collection('userEventQuota').doc(uid);

  return db.runTransaction(async transaction => {
    const quotaDoc = await transaction.get(quotaRef);
    const data = quotaDoc.data();

    // Reset if different day or first time
    if (!data || data.dayKey !== today) {
      transaction.set(quotaRef, {
        dayKey: today,
        count: 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    }

    // Check limit (20 events per day for regular users)
    const MAX_EVENTS_PER_DAY = 20;
    if (data.count >= MAX_EVENTS_PER_DAY) {
      throw new HttpsError(
        'resource-exhausted',
        `Ai atins limita zilnică de ${MAX_EVENTS_PER_DAY} evenimente. Încearcă mâine sau contactează un administrator.`
      );
    }

    // Increment count
    transaction.update(quotaRef, {
      count: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return true;
  });
}

function extractJson(text) {
  if (!text) return null;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const slice = text.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function defaultRoles() {
  const base = [
    { slot: 'A', label: 'Animator', time: '14:00', durationMin: 120 },
    { slot: 'B', label: 'Ursitoare', time: '14:00', durationMin: 120 },
    { slot: 'C', label: 'Vată de zahăr', time: '14:00', durationMin: 120 },
    { slot: 'D', label: 'Popcorn', time: '14:00', durationMin: 120 },
    { slot: 'E', label: 'Vată + Popcorn', time: '14:00', durationMin: 120 },
    { slot: 'F', label: 'Decorațiuni', time: '14:00', durationMin: 120 },
    { slot: 'G', label: 'Baloane', time: '14:00', durationMin: 120 },
    { slot: 'H', label: 'Baloane cu heliu', time: '14:00', durationMin: 120 },
    { slot: 'I', label: 'Aranjamente de masă', time: '14:00', durationMin: 120 },
    { slot: 'J', label: 'Moș Crăciun', time: '14:00', durationMin: 120 },
    { slot: 'K', label: 'Gheață carbonică', time: '14:00', durationMin: 120 },
  ];
  return base;
}

function sanitizeUpdateFields(data) {
  const allowed = new Set([
    // v3 fields
    'date',
    'address',
    'phoneE164',
    'phoneRaw',
    'childName',
    'childAge',
    'childDob',
    'parentName',
    'parentPhone',
    'numChildren',
    'payment',
    'rolesBySlot',
    'notedByCode',
    // v2 backward compatibility
    'cineNoteaza',
    'sofer',
    'soferPending',
    'sarbatoritNume',
    'sarbatoritVarsta',
    'sarbatoritDob',
    'incasare',
    'roles',
  ]);

  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!allowed.has(k)) continue;
    out[k] = v;
  }
  return out;
}

exports.chatEventOps = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    secrets: [groqApiKey], // Attach GROQ_API_KEY secret
  },
  async request => {
    // Require authentication (all authenticated users can use this)
    const auth = requireAuth(request);
    const { uid, email } = auth;

    // Check employee status for permission checks
    const employeeInfo = await isEmployee(uid, email);

    const text = (request.data?.text || '').toString().trim();
    if (!text) throw new HttpsError('invalid-argument', 'Lipsește "text".');

    // DryRun mode: parse command but don't execute (for preview)
    const dryRun = request.data?.dryRun === true;

    // Access GROQ API key from secret
    const groqKey = groqApiKey.value();
    if (!groqKey) {
      console.error('[chatEventOps] GROQ_API_KEY not available');
      throw new HttpsError('failed-precondition', 'Lipsește GROQ_API_KEY.');
    }

    const groq = new Groq({ apiKey: groqKey });

    const system = `
Ești un asistent pentru gestionarea evenimentelor din Firestore (colecția "evenimente").
NU ȘTERGE NICIODATĂ. Ștergerea e interzisă (NEVER DELETE); folosește ARCHIVE (isArchived=true).

IMPORTANT - OUTPUT FORMAT:
- Returnează DOAR JSON valid, fără text extra, fără markdown, fără explicații
- NU folosi \`\`\`json sau alte formatări
- Răspunsul trebuie să fie JSON pur care poate fi parsat direct

IMPORTANT - CONVERSATIONAL MODE (STATE MACHINE):
- Când user spune "vreau să notez un eveniment":
  1. Colectează 1-2 câmpuri pe mesaj (ASK_INFO)
  2. Când ai toate câmpurile obligatorii: generează PREVIEW
  3. Cere confirmare: "Confirmați aceste date?"
  4. Așteaptă răspuns afirmativ (da/confirm/corect/exact/e ok/sigur)
  5. Doar după confirmare: scrie în Firestore
- NU scrie NICIODATĂ fără confirmare explicită

IMPORTANT - DATE FORMAT:
- date MUST be in DD-MM-YYYY format (ex: 15-01-2026)
- Dacă user spune "mâine", "săptămâna viitoare", "vinerea viitoare" → returnează action:"ASK_INFO" cu message:"Te rog să specifici data exactă în format DD-MM-YYYY (ex: 15-01-2026)"
- NU calcula date relative
- NU accepta date în alt format (ex: "15 ianuarie 2026" → refuză)

IMPORTANT - ADDRESS:
- address trebuie să fie non-empty string
- Dacă lipsește adresa → returnează action:"ASK_INFO" cu message care cere adresa

Schema v3 relevantă (English fields):
- schemaVersion: 3
- eventShortId: int (auto-generated)
- date: "DD-MM-YYYY" (OBLIGATORIU pentru CREATE)
- address: string (OBLIGATORIU pentru CREATE)
- phoneE164: string (E.164 format, ex: +40712345678)
- phoneRaw: string (original format)
- childName: string
- childAge: int
- childDob: "DD-MM-YYYY"
- parentName: string
- parentPhone: string
- numChildren: int
- payment: { status: "PAID|UNPAID|CANCELLED", method?: "CASH|CARD|TRANSFER", amount?: number }
- rolesBySlot: { "01A": {...}, "01B": {...} } (slot format: eventShortId + letter)
- notedByCode: string
- isArchived: bool
- archivedAt/by/reason (doar la arhivare)
- createdAt/by, updatedAt/by (audit)

ROLURI DISPONIBILE (folosește DOAR acestea):
- Animator (animație petreceri)
- Ursitoare (pentru botezuri)
- Vată de zahăr
- Popcorn
- Vată + Popcorn (combo)
- Decorațiuni
- Baloane
- Baloane cu heliu
- Aranjamente de masă
- Moș Crăciun
- Gheață carbonică

NU folosi: fotograf, DJ, candy bar, barman, ospătar, bucătar (nu sunt servicii oferite).

IMPORTANT - ARHIVARE:
- Când user cere "arhivează" sau "anulează", întreabă OBLIGATORIU:
  "Arhivezi doar un rol specific sau întregul eveniment?"
- Pentru rol: action:"ARCHIVE_ROLE", roleSlot:"01A"
- Pentru eveniment: action:"ARCHIVE", eventId:"..."
- Cere confirmare: "Sigur vrei să arhivezi [rol X / evenimentul Y]?"

IMPORTANT - ADĂUGARE ROL:
- Când user cere "mai vreau un animator" sau "adaugă rol":
  1. Identifică evenimentul (după ID sau telefon)
  2. Verifică dacă rolul există deja
  3. Dacă da: întreabă "Modificăm rolul existent sau adăugăm încă unul?"
  4. Reconfirmă: "Acesta este pentru data X, adresa Y?"
  5. Doar după confirmare: action:"ADD_ROLE"

IMPORTANT - PERSONAJ NEHOTĂRÂT (ANIMATOR):
- Dacă user zice explicit "nu m-am hotărât la personaj" sau "nu știu ce personaj":
  1. Salvezi rolul cu details.personaj = null
  2. Setezi pending.personaj = true
  3. Întrebare de control: "Am notat animator fără personaj. Vă contactăm mâine pentru a decide. Confirmați?"
  4. Doar după confirmare: creezi task PENDING_PERSONAJ pentru mâine 12:00

IMPORTANT - DURATĂ ANIMATOR:
- Acceptă: "2", "120", "90", "1.5", "2 ore", "120 min", "90 min"
- Convertește în minute
- Confirmă interpretarea: "Am înțeles {interpretation}. Confirmați?"
- Exemplu: user zice "2" → AI: "Am înțeles 2 ore = 120 minute. Confirmați?"
- Exemplu: user zice "90" → AI: "Am înțeles 90 minute = 1.5 ore. Confirmați?"

IMPORTANT - URSITOARE:
- Întreabă: "3 ursitoare bune sau 3 bune + 1 rea (total 4)?"
- Dacă user zice "4 ursitoare" → automat 3 bune + 1 rea
- Dacă user zice "3 ursitoare" → doar 3 bune
- Întreabă ora de început (ex: "14:00")
- Durată: 60 minute (FIX, nu întreba)
- Creezi roluri consecutive: 01B, 01C, 01D (și 01E dacă 4)
- Toate au aceeași oră de început
- Returnează: roles: [{ roleType: "ursitoare_buna", ... }, { roleType: "ursitoare_rea", ... }]

Returnează:
{
  "action": "CREATE|UPDATE|ARCHIVE|ARCHIVE_ROLE|ADD_ROLE|UNARCHIVE|LIST|NONE|ASK_INFO",
  "eventId": "optional",
  "roleSlot": "optional",    // pt ARCHIVE_ROLE
  "data": { ... },          // pt CREATE/UPDATE/ADD_ROLE
  "reason": "optional",     // pt ARCHIVE
  "limit": 10,              // pt LIST
  "message": "optional"     // pt ASK_INFO
}
Dacă utilizatorul cere "șterge", întoarce action:"ARCHIVE" sau "NONE".
`.trim();

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const cmd = extractJson(raw);

    if (!cmd || !cmd.action) {
      return {
        ok: false,
        action: 'NONE',
        message:
          'Nu am putut interpreta comanda. Încearcă: "CREEAZA eveniment pe 2026-01-12 la Adresa..., Sarbatorit X, 7 ani".',
        raw,
      };
    }

    const db = admin.firestore();
    const action = String(cmd.action || 'NONE').toUpperCase();

    // ASK_INFO: AI needs more information from user (conversational mode)
    if (action === 'ASK_INFO') {
      return {
        ok: true,
        action: 'ASK_INFO',
        message: cmd.message || 'Am nevoie de mai multe informații pentru a continua.',
        dryRun: true,
      };
    }

    // hard block delete
    if (action === 'DELETE') {
      return {
        ok: false,
        action: 'NONE',
        message: 'Ștergerea este dezactivată (NEVER DELETE). Folosește ARHIVEAZĂ.',
      };
    }

    if (action === 'LIST') {
      const limit = Math.max(1, Math.min(50, Number(cmd.limit || 10)));

      // LIST is read-only, execute even in dryRun
      const snap = await db
        .collection('evenimente')
        .where('isArchived', '==', false)
        .orderBy('date', 'desc')
        .limit(limit)
        .get();

      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { ok: true, action: 'LIST', items, dryRun: false };
    }

    if (action === 'CREATE') {
      const data = cmd.data || {};
      const clientRequestId = request.data?.clientRequestId || null;

      // Idempotency: check if event with this clientRequestId already exists
      if (clientRequestId && !dryRun) {
        const existingSnap = await db
          .collection('evenimente')
          .where('clientRequestId', '==', clientRequestId)
          .where('createdBy', '==', uid)
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          const existingDoc = existingSnap.docs[0];
          return {
            ok: true,
            action: 'CREATE',
            eventId: existingDoc.id,
            message: `Eveniment deja creat: ${existingDoc.id}`,
            idempotent: true,
            dryRun: false,
          };
        }
      }

      // Rate limiting for non-employees (employees bypass rate limit)
      if (!dryRun && !employeeInfo.isEmployee) {
        await checkRateLimit(uid);
      }

      // Get next eventShortId
      const eventShortId = await getNextEventShortId();

      // Build v3 event data
      const eventData = {
        schemaVersion: 3,
        eventShortId,
        date: String(data.date || '').trim(),
        address: String(data.address || '').trim(),
        phoneE164: data.phoneE164 || null,
        phoneRaw: data.phoneRaw || null,
        childName: data.childName || data.sarbatoritNume || null,
        childAge: data.childAge || data.sarbatoritVarsta || null,
        childDob: data.childDob || data.sarbatoritDob || null,
        parentName: data.parentName || null,
        parentPhone: data.parentPhone || null,
        numChildren: data.numChildren || null,
        payment: data.payment || data.incasare || { status: 'UNPAID', method: null, amount: 0 },
        rolesBySlot: {},
        notedByCode: null,
        isArchived: false,
        clientRequestId,
      };

      // Convert roles array to rolesBySlot
      if (Array.isArray(data.roles) && data.roles.length > 0) {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const prefix = eventShortId.toString().padStart(2, '0');
        data.roles.forEach((role, index) => {
          const slot = `${prefix}${letters[index] || 'A'}`;
          eventData.rolesBySlot[slot] = {
            slot,
            roleType: role.roleType || role.label || 'unknown',
            label: role.label || role.roleType || 'Unknown',
            startTime: role.startTime || role.time || '14:00',
            durationMin: role.durationMin || 120,
            status: 'active',
            assigneeUid: null,
            assigneeCode: null,
            assignedCode: role.assignedCode || null,
            pendingCode: role.pendingCode || null,
            details: role.details || {},
            pending: role.pending || null,
            notes: null,
            checklist: [],
            resources: [],
          };
        });
      }

      // Validate with v3Validators
      const validation = validateEventV3(eventData);
      if (!validation.valid) {
        return {
          ok: false,
          action: 'NONE',
          message: `Validare eșuată: ${validation.errors.join(', ')}`,
        };
      }

      // DryRun: return preview without writing to Firestore
      if (dryRun) {
        return {
          ok: true,
          action: 'CREATE',
          data: eventData,
          message: 'Preview: Eveniment va fi creat cu aceste date',
          dryRun: true,
        };
      }

      // Create event with v3Operations
      const userContext = { uid, email };
      const result = await createEventV3(eventData, userContext);

      // Check for pending personaj (animator with personaj=null)
      const pendingTasks = [];
      for (const [slot, role] of Object.entries(eventData.rolesBySlot)) {
        if (
          role.roleType === 'animator' &&
          role.pending &&
          role.pending.personaj === true
        ) {
          const taskId = await createPendingPersonajTask(
            result.eventId,
            result.eventShortId,
            slot,
            eventData.date,
            eventData.address,
            eventData.phoneE164,
            employeeInfo.staffCode || uid
          );
          pendingTasks.push({ taskId, slot });
        }
      }

      return {
        ok: true,
        action: 'CREATE',
        eventId: result.eventId,
        eventShortId: result.eventShortId,
        message: `Eveniment creat și adăugat în Evenimente.${
          pendingTasks.length > 0
            ? ` Task creat pentru personaj nehotărât (${pendingTasks.map((t) => t.slot).join(', ')}).`
            : ''
        }`,
        pendingTasks,
        dryRun: false,
      };
    }

    if (action === 'UPDATE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'UPDATE necesită eventId.' };

      // Check permissions: employee OR owner
      const eventDoc = await db.collection('evenimente').doc(eventId).get();
      if (!eventDoc.exists) {
        return { ok: false, action: 'NONE', message: 'Evenimentul nu există.' };
      }

      const eventData = eventDoc.data();
      const isOwner = eventData.createdBy === uid;

      if (!dryRun && !employeeInfo.isEmployee && !isOwner) {
        return {
          ok: false,
          action: 'NONE',
          message:
            'Nu ai permisiunea să modifici acest eveniment. Doar creatorul sau un angajat poate face modificări.',
        };
      }

      const patch = sanitizeUpdateFields(cmd.data || {});

      // NU permitem schimbarea isArchived aici
      delete patch.isArchived;
      delete patch.archivedAt;
      delete patch.archivedBy;
      delete patch.archiveReason;

      // DryRun: return preview without writing to Firestore
      if (dryRun) {
        return {
          ok: true,
          action: 'UPDATE',
          eventId,
          data: patch,
          message: `Preview: Eveniment ${eventId} va fi actualizat cu aceste date`,
          dryRun: true,
        };
      }

      // Apply changes with audit trail
      const userContext = { uid, email };
      const metadata = {
        source: 'ai_chat',
        action: 'UPDATE',
        reason: cmd.reason || 'AI chat update',
      };

      await applyChangeWithAudit(eventId, patch, userContext, metadata);

      return {
        ok: true,
        action: 'UPDATE',
        eventId,
        message: `Eveniment actualizat: ${eventId}`,
        dryRun: false,
      };
    }

    if (action === 'ARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'ARCHIVE necesită eventId.' };

      // Check permissions: employee OR owner
      const eventDoc = await db.collection('evenimente').doc(eventId).get();
      if (!eventDoc.exists) {
        return { ok: false, action: 'NONE', message: 'Evenimentul nu există.' };
      }

      const eventData = eventDoc.data();
      const isOwner = eventData.createdBy === uid;

      if (!dryRun && !employeeInfo.isEmployee && !isOwner) {
        return {
          ok: false,
          action: 'NONE',
          message:
            'Nu ai permisiunea să arhivezi acest eveniment. Doar creatorul sau un angajat poate arhiva.',
        };
      }

      const update = {
        isArchived: true,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedBy: uid,
        ...(cmd.reason ? { archiveReason: String(cmd.reason) } : {}),
      };

      // DryRun: return preview without writing to Firestore
      if (dryRun) {
        return {
          ok: true,
          action: 'ARCHIVE',
          eventId,
          reason: cmd.reason || '',
          message: `Preview: Eveniment ${eventId} va fi arhivat`,
          dryRun: true,
        };
      }

      // Apply changes with audit trail
      const userContext = { uid, email };
      const metadata = {
        source: 'ai_chat',
        action: 'ARCHIVE',
        reason: cmd.reason || 'AI chat archive',
      };

      await applyChangeWithAudit(eventId, update, userContext, metadata);

      return {
        ok: true,
        action: 'ARCHIVE',
        eventId,
        message: `Eveniment arhivat: ${eventId}`,
        dryRun: false,
      };
    }

    if (action === 'UNARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'UNARCHIVE necesită eventId.' };

      // Check permissions: employee OR owner
      const eventDoc = await db.collection('evenimente').doc(eventId).get();
      if (!eventDoc.exists) {
        return { ok: false, action: 'NONE', message: 'Evenimentul nu există.' };
      }

      const eventData = eventDoc.data();
      const isOwner = eventData.createdBy === uid;

      if (!dryRun && !employeeInfo.isEmployee && !isOwner) {
        return {
          ok: false,
          action: 'NONE',
          message:
            'Nu ai permisiunea să dezarhivezi acest eveniment. Doar creatorul sau un angajat poate dezarhiva.',
        };
      }

      // DryRun: return preview without writing to Firestore
      if (dryRun) {
        return {
          ok: true,
          action: 'UNARCHIVE',
          eventId,
          message: `Preview: Eveniment ${eventId} va fi dezarhivat`,
          dryRun: true,
        };
      }

      const update = {
        isArchived: false,
        archivedAt: admin.firestore.FieldValue.delete(),
        archivedBy: admin.firestore.FieldValue.delete(),
        archiveReason: admin.firestore.FieldValue.delete(),
      };

      // Apply changes with audit trail
      const userContext = { uid, email };
      const metadata = {
        source: 'ai_chat',
        action: 'UNARCHIVE',
        reason: 'AI chat unarchive',
      };

      await applyChangeWithAudit(eventId, update, userContext, metadata);

      return {
        ok: true,
        action: 'UNARCHIVE',
        eventId,
        message: `Eveniment dezarhivat: ${eventId}`,
        dryRun: false,
      };
    }

    if (action === 'ARCHIVE_ROLE') {
      const eventId = String(cmd.eventId || '').trim();
      const roleSlot = String(cmd.roleSlot || '').trim();

      if (!eventId) {
        return { ok: false, action: 'NONE', message: 'ARCHIVE_ROLE necesită eventId.' };
      }
      if (!roleSlot) {
        return { ok: false, action: 'NONE', message: 'ARCHIVE_ROLE necesită roleSlot.' };
      }

      // Check permissions: employee OR owner
      const eventDoc = await db.collection('evenimente').doc(eventId).get();
      if (!eventDoc.exists) {
        return { ok: false, action: 'NONE', message: 'Evenimentul nu există.' };
      }

      const eventData = eventDoc.data();
      const isOwner = eventData.createdBy === uid;

      if (!dryRun && !employeeInfo.isEmployee && !isOwner) {
        return {
          ok: false,
          action: 'NONE',
          message:
            'Nu ai permisiunea să arhivezi roluri. Doar creatorul sau un angajat poate arhiva.',
        };
      }

      // Check if role exists
      const rolesBySlot = eventData.rolesBySlot || {};
      if (!rolesBySlot[roleSlot]) {
        return { ok: false, action: 'NONE', message: `Rolul ${roleSlot} nu există.` };
      }

      // DryRun: return preview
      if (dryRun) {
        return {
          ok: true,
          action: 'ARCHIVE_ROLE',
          eventId,
          roleSlot,
          message: `Preview: Rolul ${roleSlot} va fi arhivat`,
          dryRun: true,
        };
      }

      // Archive role
      const update = {
        [`rolesBySlot.${roleSlot}.isArchived`]: true,
        [`rolesBySlot.${roleSlot}.archivedAt`]: admin.firestore.FieldValue.serverTimestamp(),
        [`rolesBySlot.${roleSlot}.archivedBy`]: uid,
        [`rolesBySlot.${roleSlot}.archiveReason`]: cmd.reason || 'AI chat archive',
      };

      const userContext = { uid, email };
      const metadata = {
        source: 'ai_chat',
        action: 'ARCHIVE_ROLE',
        reason: cmd.reason || 'AI chat archive role',
        roleSlot,
      };

      await applyChangeWithAudit(eventId, update, userContext, metadata);

      return {
        ok: true,
        action: 'ARCHIVE_ROLE',
        eventId,
        roleSlot,
        message: `Rol ${roleSlot} arhivat cu succes.`,
        dryRun: false,
      };
    }

    if (action === 'ADD_ROLE') {
      const data = cmd.data || {};
      const { eventShortId, phoneE164, date, address } = data;

      // Identify event
      const identification = await identifyEventForUpdate({
        eventShortId,
        phoneE164,
        date,
        address,
      });

      if (!identification.found) {
        return {
          ok: false,
          action: 'ASK_INFO',
          message: identification.message,
        };
      }

      if (identification.events.length > 1) {
        return {
          ok: false,
          action: 'ASK_INFO',
          message: identification.message,
        };
      }

      const event = identification.events[0];
      const eventId = event.id;

      // Check if role already exists
      const roleType = data.roleType || data.label || 'unknown';
      const roleCheck = checkRoleExists(event, roleType);

      if (roleCheck.exists) {
        return {
          ok: false,
          action: 'ASK_INFO',
          message: `Rolul ${roleType} există deja (slot ${roleCheck.slot}).\n\nVrei să:\n1. Modifici rolul existent?\n2. Adaugi încă un rol de același tip?`,
        };
      }

      // Check permissions
      const isOwner = event.createdBy === uid;
      if (!dryRun && !employeeInfo.isEmployee && !isOwner) {
        return {
          ok: false,
          action: 'NONE',
          message:
            'Nu ai permisiunea să adaugi roluri. Doar creatorul sau un angajat poate adăuga.',
        };
      }

      // Allocate slot
      const { allocateSlot } = require('./v3Operations');
      const existingSlots = Object.keys(event.rolesBySlot || {});
      const newSlot = allocateSlot(event.eventShortId, existingSlots);

      // Build role data
      const roleData = {
        slot: newSlot,
        roleType: roleType,
        label: data.label || roleType,
        startTime: data.startTime || '14:00',
        durationMin: data.durationMin || 120,
        status: 'active',
        assigneeUid: null,
        assigneeCode: null,
        assignedCode: data.assignedCode || null,
        pendingCode: data.pendingCode || null,
        details: data.details || {},
        pending: data.pending || null,
        notes: null,
        checklist: [],
        resources: [],
        isArchived: false,
      };

      // DryRun: return preview
      if (dryRun) {
        return {
          ok: true,
          action: 'ADD_ROLE',
          eventId,
          roleSlot: newSlot,
          data: roleData,
          message: `Preview: Rol ${newSlot} va fi adăugat la evenimentul ${event.eventShortId}`,
          dryRun: true,
        };
      }

      // Add role
      const update = {
        [`rolesBySlot.${newSlot}`]: roleData,
      };

      const userContext = { uid, email };
      const metadata = {
        source: 'ai_chat',
        action: 'ADD_ROLE',
        reason: 'AI chat add role',
        roleSlot: newSlot,
      };

      await applyChangeWithAudit(eventId, update, userContext, metadata);

      // Check for pending personaj (animator with personaj=null)
      let taskId = null;
      if (
        roleData.roleType === 'animator' &&
        roleData.pending &&
        roleData.pending.personaj === true
      ) {
        taskId = await createPendingPersonajTask(
          eventId,
          event.eventShortId,
          newSlot,
          event.date,
          event.address,
          event.phoneE164,
          employeeInfo.staffCode || uid
        );
      }

      return {
        ok: true,
        action: 'ADD_ROLE',
        eventId,
        roleSlot: newSlot,
        message: `Rol ${newSlot} adăugat cu succes la evenimentul ${event.eventShortId}.${
          taskId ? ` Task creat pentru personaj nehotărât.` : ''
        }`,
        taskId,
        dryRun: false,
      };
    }

    return { ok: false, action: 'NONE', message: `Acțiune necunoscută: ${action}`, raw };
  }
);

// Force redeploy Fri Jan  9 14:06:54 UTC 2026
