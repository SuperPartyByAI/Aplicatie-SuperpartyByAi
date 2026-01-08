'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Groq SDK
const Groq = require('groq-sdk');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  const email = request.auth.token?.email || '';
  return { uid: request.auth.uid, email };
}

// Simplu: allowlist de admini prin env ADMIN_EMAILS="a@x.com,b@y.com"
function requireAdmin({ email }) {
  const allow = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allow.length) {
    throw new HttpsError(
      'failed-precondition',
      'ADMIN_EMAILS nu e setat. Setează env ADMIN_EMAILS cu emailurile admin.'
    );
  }
  if (!allow.includes((email || '').toLowerCase())) {
    throw new HttpsError('permission-denied', `Nu ai drepturi de admin (${email}).`);
  }
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
    { slot: 'B', label: 'Fotograf', time: '14:00', durationMin: 120 },
    { slot: 'C', label: 'DJ', time: '14:00', durationMin: 120 },
    { slot: 'D', label: 'Barman', time: '14:00', durationMin: 120 },
    { slot: 'E', label: 'Ospatar', time: '14:00', durationMin: 120 },
    { slot: 'F', label: 'Bucatar', time: '14:00', durationMin: 120 },
  ];
  return base;
}

function sanitizeUpdateFields(data) {
  const allowed = new Set([
    'date', 'address', 'cineNoteaza', 'sofer', 'soferPending',
    'sarbatoritNume', 'sarbatoritVarsta', 'sarbatoritDob',
    'incasare', 'roles'
  ]);

  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!allowed.has(k)) continue;
    out[k] = v;
  }
  return out;
}

exports.chatEventOps = onCall(
  { region: 'us-central1', timeoutSeconds: 30 },
  async (request) => {
    const { uid, email } = requireAuth(request);
    requireAdmin({ email });

    const text = (request.data?.text || '').toString().trim();
    if (!text) throw new HttpsError('invalid-argument', 'Lipsește "text".');

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new HttpsError('failed-precondition', 'Lipsește GROQ_API_KEY.');

    const groq = new Groq({ apiKey: groqKey });

    const system = `
Ești un asistent pentru gestionarea evenimentelor din Firestore (colecția "evenimente").
NU ȘTERGE NICIODATĂ. Ștergerea e interzisă (NEVER DELETE); folosește ARCHIVE (isArchived=true).
Răspunde DOAR cu JSON valid, fără text extra.

Schema v2 relevantă:
- schemaVersion: 2
- date: "YYYY-MM-DD"
- address: string
- sarbatoritNume: string
- sarbatoritVarsta: int
- incasare: { status: "INCASAT|NEINCASAT|ANULAT", metoda?: "CASH|CARD|TRANSFER", suma?: number }
- roles: [{ slot:"A"-"J", label:string, time:"HH:mm", durationMin:int, assignedCode?:string, pendingCode?:string }]
- isArchived: bool
- archivedAt/by/reason (doar la arhivare)
- createdAt/by, updatedAt/by (audit)

Returnează:
{
  "action": "CREATE|UPDATE|ARCHIVE|UNARCHIVE|LIST|NONE",
  "eventId": "optional",
  "data": { ... },          // pt CREATE/UPDATE
  "reason": "optional",     // pt ARCHIVE
  "limit": 10               // pt LIST
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
      const snap = await db.collection('evenimente')
        .where('isArchived', '==', false)
        .orderBy('date', 'desc')
        .limit(limit)
        .get();

      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { ok: true, action: 'LIST', items };
    }

    if (action === 'CREATE') {
      const data = cmd.data || {};
      const now = admin.firestore.FieldValue.serverTimestamp();

      const doc = {
        schemaVersion: 2,
        date: String(data.date || '').trim(),
        address: String(data.address || '').trim(),
        sarbatoritNume: String(data.sarbatoritNume || '').trim(),
        sarbatoritVarsta: Number.isFinite(Number(data.sarbatoritVarsta)) ? Number(data.sarbatoritVarsta) : 0,
        ...(data.sarbatoritDob ? { sarbatoritDob: String(data.sarbatoritDob) } : {}),
        incasare: data.incasare && typeof data.incasare === 'object' ? data.incasare : { status: 'NEINCASAT' },
        roles: Array.isArray(data.roles) ? data.roles : defaultRoles(),
        isArchived: false,
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      };

      if (!doc.date || !doc.address) {
        return { ok: false, action: 'NONE', message: 'CREATE necesită cel puțin date (YYYY-MM-DD) și address.' };
      }

      const ref = await db.collection('evenimente').add(doc);
      return { ok: true, action: 'CREATE', eventId: ref.id, message: `Eveniment creat: ${ref.id}` };
    }

    if (action === 'UPDATE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'UPDATE necesită eventId.' };

      const patch = sanitizeUpdateFields(cmd.data || {});
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      patch.updatedBy = uid;

      // NU permitem schimbarea isArchived aici
      delete patch.isArchived;
      delete patch.archivedAt;
      delete patch.archivedBy;
      delete patch.archiveReason;

      await db.collection('evenimente').doc(eventId).update(patch);
      return { ok: true, action: 'UPDATE', eventId, message: `Eveniment actualizat: ${eventId}` };
    }

    if (action === 'ARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'ARCHIVE necesită eventId.' };

      const update = {
        isArchived: true,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedBy: uid,
        ...(cmd.reason ? { archiveReason: String(cmd.reason) } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      };

      await db.collection('evenimente').doc(eventId).update(update);
      return { ok: true, action: 'ARCHIVE', eventId, message: `Eveniment arhivat: ${eventId}` };
    }

    if (action === 'UNARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) return { ok: false, action: 'NONE', message: 'UNARCHIVE necesită eventId.' };

      await db.collection('evenimente').doc(eventId).update({
        isArchived: false,
        archivedAt: admin.firestore.FieldValue.delete(),
        archivedBy: admin.firestore.FieldValue.delete(),
        archiveReason: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      });

      return { ok: true, action: 'UNARCHIVE', eventId, message: `Eveniment dezarhivat: ${eventId}` };
    }

    return { ok: false, action: 'NONE', message: `Acțiune necunoscută: ${action}`, raw };
  }
);
