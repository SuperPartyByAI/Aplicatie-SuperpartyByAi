'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

// Groq SDK
const Groq = require('groq-sdk');

// Normalizers for V3 EN schema
const { normalizeEventFields, normalizeRoleFields, normalizeRoleType } = require('./normalizers');
const { getNextEventShortId, getNextFreeSlot } = require('./shortCodeGenerator');

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
  return envEmails.split(',').map(e => e.trim()).filter(Boolean);
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

  return db.runTransaction(async (transaction) => {
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
  // V3 EN allowed fields
  const allowed = new Set([
    'date', 'address', 'phoneE164', 'phoneRaw',
    'childName', 'childAge', 'childDob',
    'parentName', 'parentPhone', 'numChildren',
    'payment', 'rolesBySlot',
    // Legacy RO fields (will be normalized)
    'sarbatoritNume', 'sarbatoritVarsta', 'sarbatoritDob',
    'incasare', 'roles'
  ]);

  const raw = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!allowed.has(k)) continue;
    raw[k] = v;
  }

  // Normalize to V3 EN
  const normalized = normalizeEventFields(raw);

  // Return only the fields that were in the input
  const out = {};
  if (data.date || data.data) out.date = normalized.date;
  if (data.address || data.adresa) out.address = normalized.address;
  if (data.phoneE164 || data.telefonClientE164) out.phoneE164 = normalized.phoneE164;
  if (data.phoneRaw || data.telefonClientRaw) out.phoneRaw = normalized.phoneRaw;
  if (data.childName || data.sarbatoritNume) out.childName = normalized.childName;
  if (data.childAge || data.sarbatoritVarsta) out.childAge = normalized.childAge;
  if (data.childDob || data.sarbatoritDob) out.childDob = normalized.childDob;
  if (data.parentName || data.numeParinte) out.parentName = normalized.parentName;
  if (data.parentPhone || data.telefonParinte) out.parentPhone = normalized.parentPhone;
  if (data.numChildren || data.nrCopiiAprox) out.numChildren = normalized.numChildren;
  if (data.payment || data.incasare) out.payment = normalized.payment;
  if (data.rolesBySlot || data.roluriPeSlot || data.roles) out.rolesBySlot = normalized.rolesBySlot;

  return out;
}

// Internal handler function (can be called directly or via onCall)
async function chatEventOpsHandler(request) {
  const requestId = request.data?.clientRequestId || `chatEventOps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  try {
    console.log(`[${requestId}] chatEventOps called`, {
      uid: request.auth?.uid,
      email: request.auth?.token?.email,
      textLength: (request.data?.text || '').length,
      dryRun: request.data?.dryRun === true,
    });

    // Require authentication (all authenticated users can use this)
    const auth = requireAuth(request);
    const { uid, email } = auth;

    // Check employee status for permission checks
    const employeeInfo = await isEmployee(uid, email);

    const text = (request.data?.text || '').toString().trim();
    if (!text) {
      console.error(`[${requestId}] Missing text parameter`);
      throw new HttpsError('invalid-argument', 'Lipsește "text".');
    }

    // DryRun mode: parse command but don't execute (for preview)
    const dryRun = request.data?.dryRun === true;

    // Access GROQ API key from secret
    const groqKey = groqApiKey.value();
    if (!groqKey) {
      console.error(`[${requestId}] GROQ_API_KEY not available`);
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

IMPORTANT - CONVERSATIONAL MODE (INTERACTIVE FLOW):
- Dacă user spune "vreau să notez un eveniment" SAU "am de notat o petrecere" SAU comenzi similare FĂRĂ date complete → returnează action:"ASK_INFO" cu message care cere informațiile lipsă
- Exemplu: {"action":"ASK_INFO","message":"Perfect! Pentru a nota evenimentul, am nevoie de:\\n\\n📅 Data (format DD-MM-YYYY, ex: 15-01-2026)\\n📍 Adresa/Locația\\n🎂 Nume sărbătorit (opțional)\\n🎈 Vârsta (opțional)\\n🎭 Roluri necesare (animator, ursitoare, vată de zahăr, etc.)\\n\\nÎmi poți da aceste detalii?"}
- NU returna action:"NONE" pentru comenzi incomplete - ghidează user-ul să completeze informațiile
- Când ai toate detaliile necesare, REZUMĂ și CERE CONFIRMARE înainte de CREATE
- Exemplu confirmare: {"action":"ASK_INFO","message":"Am înțeles:\\n\\n📅 Data: 15-01-2026\\n📍 Adresa: București, Str. Exemplu 10\\n🎂 Sărbătorit: Maria (5 ani)\\n🎭 Roluri:\\n  • Animator (14:00, 2 ore)\\n  • Vată de zahăr (14:00, 2 ore)\\n\\nConfirm crearea evenimentului?"}
- Dacă user confirmă ("da", "ok", "confirm", "bine") → execută CREATE

IMPORTANT - DATE FORMAT:
- date MUST be in DD-MM-YYYY format (ex: 15-01-2026)
- Dacă user spune "mâine", "săptămâna viitoare", "vinerea viitoare" → returnează action:"ASK_INFO" cu message:"Te rog să specifici data exactă în format DD-MM-YYYY (ex: 15-01-2026)"
- NU calcula date relative
- NU accepta date în alt format (ex: "15 ianuarie 2026" → refuză)

IMPORTANT - ADDRESS:
- address trebuie să fie non-empty string
- Dacă lipsește adresa → returnează action:"ASK_INFO" cu message care cere adresa

IMPORTANT - EVENT SHORT ID:
- eventShortId este un număr numeric (1, 2, 3, ...) generat automat
- NU folosi string-uri cu zero-padding ("01", "02")
- Când referențiezi evenimente, folosește eventShortId numeric

Schema V3 (EN) relevantă:
- schemaVersion: 3
- eventShortId: number (generat automat, identificator scurt numeric)
- date: "DD-MM-YYYY" (OBLIGATORIU pentru CREATE)
- address: string (OBLIGATORIU pentru CREATE)
- phoneE164: string (telefon în format E.164, ex: "+40712345678")
- phoneRaw: string (telefon raw din input)
- childName: string (nume sărbătorit)
- childAge: number (vârstă sărbătorit)
- childDob: string (data nașterii, format DD-MM-YYYY)
- parentName: string (nume părinte)
- parentPhone: string (telefon părinte)
- numChildren: number (număr aproximativ copii)
- payment: { status: "PAID|UNPAID|CANCELLED", method?: "CASH|CARD|TRANSFER", amount?: number }
- rolesBySlot: { "01A": {...}, "01B": {...} } (roluri organizate pe sloturi)
- isArchived: bool
- archivedAt/By/Reason (doar la arhivare)
- notedByCode: string (codul angajatului care a notat)
- createdAt/By, updatedAt/By (audit)

ROLURI DISPONIBILE (folosește DOAR acestea):
- ANIMATOR (animație petreceri)
- URSITOARE (pentru botezuri)
- COTTON_CANDY (vată de zahăr)
- POPCORN (popcorn)
- DECORATIONS (decorațiuni)
- BALLOONS (baloane)
- HELIUM_BALLOONS (baloane cu heliu)
- SANTA_CLAUS (Moș Crăciun)
- DRY_ICE (gheață carbonică)
- ARCADE (arcadă jocuri)

NU folosi: fotograf, DJ, candy bar, barman, ospătar, bucătar (nu sunt servicii oferite).

Returnează:
{
  "action": "CREATE|UPDATE|ARCHIVE|UNARCHIVE|LIST|NONE|ASK_INFO",
  "eventId": "optional",
  "data": { 
    "date": "DD-MM-YYYY",
    "address": "string",
    "childName": "string",
    "childAge": number,
    "phoneE164": "+40...",
    "rolesBySlot": {}
  },
  "reason": "optional",
  "message": "optional",
  "limit": 10
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
        message: 'Nu am putut interpreta comanda. Încearcă: "CREEAZA eveniment pe 2026-01-12 la Adresa..., Sarbatorit X, 7 ani".',
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
      const snap = await db.collection('evenimente')
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

      // VALIDATION: date and address are required
      const dateStr = String(data.date || '').trim();
      const addressStr = String(data.address || '').trim();
      
      if (!dateStr) {
        return {
          ok: false,
          action: 'NONE',
          message: 'Lipsește data evenimentului. Te rog să specifici data în format DD-MM-YYYY (ex: 15-01-2026).',
        };
      }
      
      if (!addressStr) {
        return {
          ok: false,
          action: 'NONE',
          message: 'Lipsește adresa evenimentului. Te rog să specifici locația (ex: București, Str. Exemplu 10).',
        };
      }
      
      // Validate date format (DD-MM-YYYY)
      const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!dateRegex.test(dateStr)) {
        return {
          ok: false,
          action: 'NONE',
          message: `Data trebuie să fie în format DD-MM-YYYY (ex: 15-01-2026). Ai introdus: "${dateStr}"`,
        };
      }

      // Idempotency: check if event with this clientRequestId already exists
      if (clientRequestId && !dryRun) {
        const existingSnap = await db.collection('evenimente')
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

      const now = admin.firestore.FieldValue.serverTimestamp();

      // Normalize input to V3 EN schema
      const normalized = normalizeEventFields(data);

      // Generate eventShortId (numeric)
      const eventShortId = await getNextEventShortId();

      // Convert roles[] to rolesBySlot if needed
      let rolesBySlot = normalized.rolesBySlot || {};
      if (Array.isArray(data.roles) && data.roles.length > 0) {
        rolesBySlot = {};
        for (let i = 0; i < data.roles.length; i++) {
          const slot = getNextFreeSlot(eventShortId, rolesBySlot);
          rolesBySlot[slot] = normalizeRoleFields(data.roles[i]);
        }
      } else if (Object.keys(rolesBySlot).length === 0) {
        // No roles provided, use default
        const defaultRole = defaultRoles()[0];
        const slot = getNextFreeSlot(eventShortId, {});
        rolesBySlot[slot] = normalizeRoleFields(defaultRole);
      }

      const doc = {
        schemaVersion: 3,
        eventShortId,
        date: String(normalized.date || '').trim(),
        address: String(normalized.address || '').trim(),
        phoneE164: normalized.phoneE164 || null,
        phoneRaw: normalized.phoneRaw || null,
        childName: String(normalized.childName || '').trim(),
        childAge: Number.isFinite(Number(normalized.childAge)) ? Number(normalized.childAge) : 0,
        childDob: normalized.childDob || null,
        parentName: normalized.parentName || null,
        parentPhone: normalized.parentPhone || null,
        numChildren: normalized.numChildren || null,
        payment: normalized.payment || { status: 'UNPAID', method: null, amount: 0 },
        rolesBySlot,
        isArchived: false,
        notedByCode: employeeInfo.staffCode || null,
        createdAt: now,
        createdBy: uid,
        createdByEmail: email,
        updatedAt: now,
        updatedBy: uid,
        ...(clientRequestId ? { clientRequestId } : {}),
      };

      if (!doc.date || !doc.address) {
        return { ok: false, action: 'NONE', message: 'CREATE necesită cel puțin date (DD-MM-YYYY) și address.' };
      }

      // DryRun: return preview without writing to Firestore
      if (dryRun) {
        return {
          ok: true,
          action: 'CREATE',
          data: doc,
          message: 'Preview: Eveniment va fi creat cu aceste date',
          dryRun: true,
        };
      }

      const ref = await db.collection('evenimente').add(doc);
      const result = { ok: true, action: 'CREATE', eventId: ref.id, message: `Eveniment creat și adăugat în Evenimente.`, dryRun: false };
      console.log(`[${requestId}] Event created`, {
        eventId: ref.id,
        eventShortId: doc.eventShortId,
        date: doc.date,
        address: doc.address,
      });
      return result;
    }

    if (action === 'UPDATE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'UPDATE necesită eventId.' };

      // Check permissions: employee OR owner
      if (!dryRun) {
        const eventDoc = await db.collection('evenimente').doc(eventId).get();
        if (!eventDoc.exists) {
          return { ok: false, action: 'NONE', message: 'Evenimentul nu există.' };
        }

        const eventData = eventDoc.data();
        const isOwner = eventData.createdBy === uid;

        if (!employeeInfo.isEmployee && !isOwner) {
          return {
            ok: false,
            action: 'NONE',
            message: 'Nu ai permisiunea să modifici acest eveniment. Doar creatorul sau un angajat poate face modificări.',
          };
        }
      }

      const patch = sanitizeUpdateFields(cmd.data || {});
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      patch.updatedBy = uid;

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

      await db.collection('evenimente').doc(eventId).update(patch);
      return { ok: true, action: 'UPDATE', eventId, message: `Eveniment actualizat: ${eventId}`, dryRun: false };
    }

    if (action === 'ARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'ARCHIVE necesită eventId.' };

      // Check permissions: employee OR owner
      if (!dryRun) {
        const eventDoc = await db.collection('evenimente').doc(eventId).get();
        if (!eventDoc.exists) {
          return { ok: false, action: 'NONE', message: 'Evenimentul nu există.' };
        }

        const eventData = eventDoc.data();
        const isOwner = eventData.createdBy === uid;

        if (!employeeInfo.isEmployee && !isOwner) {
          return {
            ok: false,
            action: 'NONE',
            message: 'Nu ai permisiunea să arhivezi acest eveniment. Doar creatorul sau un angajat poate arhiva.',
          };
        }
      }

      const update = {
        isArchived: true,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedBy: uid,
        ...(cmd.reason ? { archiveReason: String(cmd.reason) } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
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

      await db.collection('evenimente').doc(eventId).update(update);
      return { ok: true, action: 'ARCHIVE', eventId, message: `Eveniment arhivat: ${eventId}`, dryRun: false };
    }

    if (action === 'UNARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'UNARCHIVE necesită eventId.' };

      // Check permissions: employee OR owner
      if (!dryRun) {
        const eventDoc = await db.collection('evenimente').doc(eventId).get();
        if (!eventDoc.exists) {
          return { ok: false, action: 'NONE', message: 'Evenimentul nu există.' };
        }

        const eventData = eventDoc.data();
        const isOwner = eventData.createdBy === uid;

        if (!employeeInfo.isEmployee && !isOwner) {
          return {
            ok: false,
            action: 'NONE',
            message: 'Nu ai permisiunea să dezarhivezi acest eveniment. Doar creatorul sau un angajat poate dezarhiva.',
          };
        }
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

      await db.collection('evenimente').doc(eventId).update({
        isArchived: false,
        archivedAt: admin.firestore.FieldValue.delete(),
        archivedBy: admin.firestore.FieldValue.delete(),
        archiveReason: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      });

      return { ok: true, action: 'UNARCHIVE', eventId, message: `Eveniment dezarhivat: ${eventId}`, dryRun: false };
    }

    const result = { ok: false, action: 'NONE', message: `Acțiune necunoscută: ${action}`, raw };
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] chatEventOps completed`, {
      action: result.action,
      ok: result.ok,
      durationMs: duration,
    });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] chatEventOps error`, {
      error: error.message,
      stack: error.stack,
      durationMs: duration,
    });
    throw error;
  }
}

// Export as onCall handler
exports.chatEventOps = onCall(
  { 
    region: 'us-central1', 
    timeoutSeconds: 30,
    secrets: [groqApiKey]  // Attach GROQ_API_KEY secret
  },
  chatEventOpsHandler
);

// Export handler function for direct calls (e.g., from chatWithAI)
exports.chatEventOpsHandler = chatEventOpsHandler;

// Force redeploy Fri Jan  9 14:06:54 UTC 2026
