const admin = require('firebase-admin');
const Groq = require('groq-sdk');

const { normalizeEventFields, normalizeRoleFields } = require('../../functions/normalizers');
const { getNextEventShortId, getNextFreeSlot } = require('../../functions/shortCodeGenerator');

const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

function getAdminEmails() {
  const envEmails = process.env.ADMIN_EMAILS || '';
  return envEmails
    .split(',')
    .map(email => email.trim())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (!email) return false;
  const admins = new Set([SUPER_ADMIN_EMAIL, ...getAdminEmails()]);
  return admins.has(email);
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
  return [
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
}

function sanitizeUpdateFields(data) {
  const allowed = new Set([
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
    'sarbatoritNume',
    'sarbatoritVarsta',
    'sarbatoritDob',
    'incasare',
    'roles',
  ]);

  const raw = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (!allowed.has(key)) continue;
    raw[key] = value;
  }

  const normalized = normalizeEventFields(raw);
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

const SYSTEM_PROMPT = `
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

async function chatEventOpsHandler(req, res) {
  const startTime = Date.now();
  try {
    const { uid, email } = req.user || {};
    if (!uid) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    if (!isAdminEmail(email)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const text = (req.body?.text || '').toString().trim();
    if (!text) {
      return res.status(400).json({ ok: false, action: 'NONE', message: 'Lipsește "text".' });
    }
    const dryRun = req.body?.dryRun === true;
    const clientRequestId = req.body?.clientRequestId || null;

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(412).json({ ok: false, action: 'NONE', message: 'Lipsește GROQ_API_KEY.' });
    }

    const groq = new Groq({ apiKey: groqKey.trim() });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const cmd = extractJson(raw);
    if (!cmd || !cmd.action) {
      return res.json({
        ok: false,
        action: 'NONE',
        message:
          'Nu am putut interpreta comanda. Încearcă: "CREEAZA eveniment pe 2026-01-12 la Adresa..., Sarbatorit X, 7 ani".',
        raw,
      });
    }

    const db = admin.firestore();
    const action = String(cmd.action || 'NONE').toUpperCase();
    const employeeInfo = {
      isEmployee: true,
      role: 'admin',
      isGmOrAdmin: true,
      staffCode: uid,
      isSuperAdmin: true,
    };

    if (action === 'ASK_INFO') {
      return res.json({
        ok: true,
        action: 'ASK_INFO',
        message: cmd.message || 'Am nevoie de mai multe informații pentru a continua.',
        dryRun: true,
      });
    }

    if (action === 'DELETE') {
      return res.json({
        ok: false,
        action: 'NONE',
        message: 'Ștergerea este dezactivată (NEVER DELETE). Folosește ARHIVEAZĂ.',
      });
    }

    if (action === 'LIST') {
      const limit = Math.max(1, Math.min(50, Number(cmd.limit || 10)));
      const snap = await db
        .collection('evenimente')
        .where('isArchived', '==', false)
        .orderBy('date', 'desc')
        .limit(limit)
        .get();
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.json({ ok: true, action: 'LIST', items, dryRun: false });
    }

    if (action === 'CREATE') {
      const data = cmd.data || {};
      const dateStr = String(data.date || '').trim();
      const addressStr = String(data.address || '').trim();

      if (!dateStr) {
        return res.json({
          ok: false,
          action: 'NONE',
          message:
            'Lipsește data evenimentului. Te rog să specifici data în format DD-MM-YYYY (ex: 15-01-2026).',
        });
      }
      if (!addressStr) {
        return res.json({
          ok: false,
          action: 'NONE',
          message: 'Lipsește adresa evenimentului. Te rog să specifici locația (ex: București, Str. Exemplu 10).',
        });
      }

      const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!dateRegex.test(dateStr)) {
        return res.json({
          ok: false,
          action: 'NONE',
          message: `Data trebuie să fie în format DD-MM-YYYY (ex: 15-01-2026). Ai introdus: "${dateStr}"`,
        });
      }

      if (clientRequestId && !dryRun) {
        const existingSnap = await db
          .collection('evenimente')
          .where('clientRequestId', '==', clientRequestId)
          .where('createdBy', '==', uid)
          .limit(1)
          .get();
        if (!existingSnap.empty) {
          const existingDoc = existingSnap.docs[0];
          return res.json({
            ok: true,
            action: 'CREATE',
            eventId: existingDoc.id,
            message: `Eveniment deja creat: ${existingDoc.id}`,
            idempotent: true,
            dryRun: false,
          });
        }
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const normalized = normalizeEventFields(data);
      const eventShortId = await getNextEventShortId();

      let rolesBySlot = normalized.rolesBySlot || {};
      if (Array.isArray(data.roles) && data.roles.length > 0) {
        rolesBySlot = {};
        for (let i = 0; i < data.roles.length; i += 1) {
          const slot = getNextFreeSlot(eventShortId, rolesBySlot);
          rolesBySlot[slot] = normalizeRoleFields(data.roles[i]);
        }
      } else if (Object.keys(rolesBySlot).length === 0) {
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
        return res.json({
          ok: false,
          action: 'NONE',
          message: 'CREATE necesită cel puțin date (DD-MM-YYYY) și address.',
        });
      }

      if (dryRun) {
        return res.json({
          ok: true,
          action: 'CREATE',
          data: doc,
          message: 'Preview: Eveniment va fi creat cu aceste date',
          dryRun: true,
        });
      }

      const ref = await db.collection('evenimente').add(doc);
      return res.json({
        ok: true,
        action: 'CREATE',
        eventId: ref.id,
        message: 'Eveniment creat și adăugat în Evenimente.',
        dryRun: false,
      });
    }

    if (action === 'UPDATE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) {
        return res.json({ ok: false, action: 'NONE', message: 'UPDATE necesită eventId.' });
      }

      if (!dryRun) {
        const eventDoc = await db.collection('evenimente').doc(eventId).get();
        if (!eventDoc.exists) {
          return res.json({ ok: false, action: 'NONE', message: 'Evenimentul nu există.' });
        }
      }

      const patch = sanitizeUpdateFields(cmd.data || {});
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      patch.updatedBy = uid;

      delete patch.isArchived;
      delete patch.archivedAt;
      delete patch.archivedBy;
      delete patch.archiveReason;

      if (dryRun) {
        return res.json({
          ok: true,
          action: 'UPDATE',
          eventId,
          data: patch,
          message: `Preview: Eveniment ${eventId} va fi actualizat cu aceste date`,
          dryRun: true,
        });
      }

      await db.collection('evenimente').doc(eventId).update(patch);
      return res.json({
        ok: true,
        action: 'UPDATE',
        eventId,
        message: `Eveniment actualizat: ${eventId}`,
        dryRun: false,
      });
    }

    if (action === 'ARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) {
        return res.json({ ok: false, action: 'NONE', message: 'ARCHIVE necesită eventId.' });
      }

      if (!dryRun) {
        const eventDoc = await db.collection('evenimente').doc(eventId).get();
        if (!eventDoc.exists) {
          return res.json({ ok: false, action: 'NONE', message: 'Evenimentul nu există.' });
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

      if (dryRun) {
        return res.json({
          ok: true,
          action: 'ARCHIVE',
          eventId,
          reason: cmd.reason || '',
          message: `Preview: Eveniment ${eventId} va fi arhivat`,
          dryRun: true,
        });
      }

      await db.collection('evenimente').doc(eventId).update(update);
      return res.json({
        ok: true,
        action: 'ARCHIVE',
        eventId,
        message: `Eveniment arhivat: ${eventId}`,
        dryRun: false,
      });
    }

    if (action === 'UNARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) {
        return res.json({ ok: false, action: 'NONE', message: 'UNARCHIVE necesită eventId.' });
      }

      if (!dryRun) {
        const eventDoc = await db.collection('evenimente').doc(eventId).get();
        if (!eventDoc.exists) {
          return res.json({ ok: false, action: 'NONE', message: 'Evenimentul nu există.' });
        }
      }

      if (dryRun) {
        return res.json({
          ok: true,
          action: 'UNARCHIVE',
          eventId,
          message: `Preview: Eveniment ${eventId} va fi dezarhivat`,
          dryRun: true,
        });
      }

      await db.collection('evenimente').doc(eventId).update({
        isArchived: false,
        archivedAt: admin.firestore.FieldValue.delete(),
        archivedBy: admin.firestore.FieldValue.delete(),
        archiveReason: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
      return res.json({
        ok: true,
        action: 'UNARCHIVE',
        eventId,
        message: `Eveniment dezarhivat: ${eventId}`,
        dryRun: false,
      });
    }

    return res.json({ ok: false, action: 'NONE', message: `Acțiune necunoscută: ${action}`, raw });
  } catch (error) {
    return res.status(500).json({ ok: false, action: 'NONE', message: error.message });
  } finally {
    const { uid, email } = req.user || {};
    const latencyMs = Date.now() - startTime;
    if (uid) {
      console.log(`[chatEventOps] uid=${uid} email=${email || ''} latencyMs=${latencyMs}`);
    }
  }
}

module.exports = chatEventOpsHandler;
