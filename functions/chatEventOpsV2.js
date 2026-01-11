'use strict';

/**
 * Chat Event Operations V2
 * 
 * Enhanced version with:
 * - Interactive noting mode
 * - CREATE vs UPDATE logic
 * - Short codes
 * - Role detection with synonyms
 * - Role-specific logic (Animator, Ursitoare)
 * - AI interpretation logging
 * - Admin corrections
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Groq = require('groq-sdk');

// Import helper modules
const ConversationStateManager = require('./conversationStateManager');
const RoleDetector = require('./roleDetector');
const DateTimeParser = require('./dateTimeParser');
const EventIdentifier = require('./eventIdentifier');
const ShortCodeGenerator = require('./shortCodeGenerator');

// Define secret for GROQ API key
const groqApiKey = defineSecret('GROQ_API_KEY');

// Super admin email
const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

// Get admin emails from environment
function getAdminEmails() {
  const envEmails = process.env.ADMIN_EMAILS || '';
  return envEmails.split(',').map(e => e.trim()).filter(Boolean);
}

// Require authentication
function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
  }
  return {
    uid: request.auth.uid,
    email: request.auth.token?.email || '',
  };
}

// Check if user is employee
async function isEmployee(uid, email) {
  const adminEmails = [SUPER_ADMIN_EMAIL, ...getAdminEmails()];
  if (adminEmails.includes(email)) {
    return {
      isEmployee: true,
      role: 'admin',
      isGmOrAdmin: true,
      isSuperAdmin: email === SUPER_ADMIN_EMAIL,
    };
  }

  const db = admin.firestore();
  const staffDoc = await db.collection('staffProfiles').doc(uid).get();

  if (!staffDoc.exists) {
    return {
      isEmployee: false,
      role: 'user',
      isGmOrAdmin: false,
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
    isSuperAdmin: false,
  };
}

exports.chatEventOpsV2 = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    secrets: [groqApiKey],
  },
  async (request) => {
    const auth = requireAuth(request);
    const { uid, email } = auth;

    const employeeInfo = await isEmployee(uid, email);

    const text = (request.data?.text || '').toString().trim();
    if (!text) throw new HttpsError('invalid-argument', 'Lipsește "text".');

    const sessionId = request.data?.sessionId || `session_${uid}_${Date.now()}`;
    const dryRun = request.data?.dryRun === true;

    const db = admin.firestore();

    // Initialize helper modules
    const stateManager = new ConversationStateManager(db);
    const roleDetector = new RoleDetector(db);
    const dateTimeParser = new DateTimeParser();
    const eventIdentifier = new EventIdentifier(db);
    const shortCodeGenerator = new ShortCodeGenerator(db);

    // Get current conversation state
    let conversationState = await stateManager.getState(sessionId);

    // Check for cancel/exit commands
    const cancelKeywords = ['anuleaza', 'anulează', 'cancel', 'stop', 'iesi', 'ieși'];
    const normalizedText = text.toLowerCase()
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't');

    if (cancelKeywords.some(kw => normalizedText.includes(kw))) {
      if (conversationState && conversationState.notingMode) {
        await stateManager.cancelNotingMode(sessionId);
        return {
          ok: true,
          action: 'CANCELLED',
          message: '✅ Am anulat notarea evenimentului. Cu ce te pot ajuta?',
        };
      }
    }

    // Access GROQ API key
    const groqKey = groqApiKey.value();
    if (!groqKey) {
      throw new HttpsError('failed-precondition', 'Lipsește GROQ_API_KEY.');
    }

    const groq = new Groq({ apiKey: groqKey });

    // Build system prompt for AI
    const systemPrompt = buildSystemPrompt(conversationState);

    // Call AI to interpret user input
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const cmd = extractJson(raw);

    if (!cmd || !cmd.action) {
      return {
        ok: false,
        action: 'NONE',
        message: 'Nu am putut interpreta comanda. Te rog să reformulezi.',
        raw,
      };
    }

    const action = String(cmd.action || 'NONE').toUpperCase();

    // Handle ASK_INFO (AI needs more information)
    if (action === 'ASK_INFO') {
      // If in noting mode, update transcript
      if (conversationState && conversationState.notingMode) {
        await stateManager.addAIResponse(sessionId, cmd.message);
      }

      return {
        ok: true,
        action: 'ASK_INFO',
        message: cmd.message || 'Am nevoie de mai multe informații.',
        dryRun: true,
      };
    }

    // Handle START_NOTING (user wants to note an event)
    if (action === 'START_NOTING') {
      // Extract any initial data from user input
      const initialData = await extractInitialData(text, roleDetector, dateTimeParser);

      conversationState = await stateManager.startNotingMode(sessionId, uid, initialData);

      // Generate next question
      const nextQuestion = stateManager.getNextQuestion(conversationState);

      if (nextQuestion) {
        await stateManager.addAIResponse(sessionId, nextQuestion.question);
        return {
          ok: true,
          action: 'START_NOTING',
          message: nextQuestion.question,
          draftEvent: conversationState.draftEvent,
        };
      }

      // If no questions, ready for confirmation
      const summary = stateManager.generateConfirmationSummary(conversationState.draftEvent);
      await stateManager.addAIResponse(sessionId, summary);

      return {
        ok: true,
        action: 'CONFIRM',
        message: summary,
        draftEvent: conversationState.draftEvent,
      };
    }

    // Handle UPDATE_DRAFT (user provides more information while in noting mode)
    if (action === 'UPDATE_DRAFT' && conversationState && conversationState.notingMode) {
      // Extract updates from user input
      const updates = await extractUpdates(text, conversationState.draftEvent, roleDetector, dateTimeParser);

      conversationState = await stateManager.updateDraft(
        sessionId,
        updates,
        text,
        { decision: 'update_draft', clarifications: [] }
      );

      // Check if ready for confirmation
      if (stateManager.isReadyForConfirmation(conversationState.draftEvent)) {
        const summary = stateManager.generateConfirmationSummary(conversationState.draftEvent);
        await stateManager.addAIResponse(sessionId, summary);

        return {
          ok: true,
          action: 'CONFIRM',
          message: summary,
          draftEvent: conversationState.draftEvent,
        };
      }

      // Ask next question
      const nextQuestion = stateManager.getNextQuestion(conversationState);
      if (nextQuestion) {
        await stateManager.addAIResponse(sessionId, nextQuestion.question);
        return {
          ok: true,
          action: 'UPDATE_DRAFT',
          message: nextQuestion.question,
          draftEvent: conversationState.draftEvent,
        };
      }

      return {
        ok: true,
        action: 'UPDATE_DRAFT',
        message: 'Am actualizat informațiile. Mai ai ceva de adăugat?',
        draftEvent: conversationState.draftEvent,
      };
    }

    // Handle CREATE (create new event)
    if (action === 'CREATE') {
      const data = cmd.data || {};

      // If in noting mode, use draft data
      if (conversationState && conversationState.notingMode) {
        Object.assign(data, conversationState.draftEvent);
      }

      // Validate required fields
      const dateValidation = dateTimeParser.parseDate(data.date);
      if (!dateValidation || !dateValidation.valid) {
        return {
          ok: false,
          action: 'NONE',
          message: dateValidation?.message || 'Lipsește data evenimentului.',
        };
      }

      if (!data.address || !data.address.trim()) {
        return {
          ok: false,
          action: 'NONE',
          message: 'Lipsește adresa evenimentului.',
        };
      }

      // Generate short code
      const shortCode = await shortCodeGenerator.generateEventShortCode();

      // Process roles
      const roles = await processRoles(data.rolesDraft || [], shortCode, shortCodeGenerator);

      // Create event document
      const now = admin.firestore.FieldValue.serverTimestamp();

      const eventDoc = {
        schemaVersion: 2,
        shortCode,
        date: dateValidation.date,
        address: data.address.trim(),
        client: data.client || null,
        sarbatoritNume: data.sarbatoritNume || '',
        sarbatoritVarsta: data.sarbatoritVarsta || 0,
        sarbatoritDob: data.sarbatoritDob || null,
        incasare: data.incasare || { status: 'NEINCASAT' },
        roles,
        isArchived: false,
        transcriptMessages: conversationState?.transcriptMessages || [],
        aiInterpretationLog: conversationState?.aiInterpretationLog || [],
        createdAt: now,
        createdBy: uid,
        createdByEmail: email,
        updatedAt: now,
        updatedBy: uid,
      };

      if (dryRun) {
        return {
          ok: true,
          action: 'CREATE',
          data: eventDoc,
          message: 'Preview: Eveniment va fi creat cu aceste date',
          dryRun: true,
        };
      }

      const ref = await db.collection('evenimente').add(eventDoc);

      // Clear conversation state
      if (conversationState && conversationState.notingMode) {
        await stateManager.cancelNotingMode(sessionId);
      }

      return {
        ok: true,
        action: 'CREATE',
        eventId: ref.id,
        shortCode,
        message: `✅ Eveniment creat cu succes!\n📋 Cod: ${shortCode}\n📅 Data: ${dateValidation.date}\n📍 Adresa: ${data.address}`,
        dryRun: false,
      };
    }

    // Handle UPDATE (update existing event)
    if (action === 'UPDATE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) {
        return { ok: false, action: 'NONE', message: 'UPDATE necesită eventId.' };
      }

      // Check permissions
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
            message: 'Nu ai permisiunea să modifici acest eveniment.',
          };
        }
      }

      const patch = sanitizeUpdateFields(cmd.data || {});
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      patch.updatedBy = uid;

      if (dryRun) {
        return {
          ok: true,
          action: 'UPDATE',
          eventId,
          data: patch,
          message: `Preview: Eveniment ${eventId} va fi actualizat`,
          dryRun: true,
        };
      }

      await db.collection('evenimente').doc(eventId).update(patch);

      return {
        ok: true,
        action: 'UPDATE',
        eventId,
        message: `✅ Eveniment actualizat: ${eventId}`,
        dryRun: false,
      };
    }

    // Handle ARCHIVE
    if (action === 'ARCHIVE') {
      const eventId = String(cmd.eventId || '').trim();
      if (!eventId) {
        return { ok: false, action: 'NONE', message: 'ARCHIVE necesită eventId.' };
      }

      // Check permissions
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
            message: 'Nu ai permisiunea să arhivezi acest eveniment.',
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

      if (dryRun) {
        return {
          ok: true,
          action: 'ARCHIVE',
          eventId,
          message: `Preview: Eveniment ${eventId} va fi arhivat`,
          dryRun: true,
        };
      }

      await db.collection('evenimente').doc(eventId).update(update);

      return {
        ok: true,
        action: 'ARCHIVE',
        eventId,
        message: `✅ Eveniment arhivat: ${eventId}`,
        dryRun: false,
      };
    }

    // Handle LIST
    if (action === 'LIST') {
      const limit = Math.max(1, Math.min(50, Number(cmd.limit || 10)));

      const snap = await db
        .collection('evenimente')
        .where('isArchived', '==', false)
        .orderBy('date', 'desc')
        .limit(limit)
        .get();

      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      return { ok: true, action: 'LIST', items, dryRun: false };
    }

    return {
      ok: false,
      action: 'NONE',
      message: `Acțiune necunoscută: ${action}`,
      raw,
    };
  }
);

// Helper functions

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

function buildSystemPrompt(conversationState) {
  let prompt = `
Ești un asistent pentru gestionarea evenimentelor din Firestore (colecția "evenimente").

IMPORTANT - OUTPUT FORMAT:
- Returnează DOAR JSON valid, fără text extra, fără markdown, fără explicații
- NU folosi \`\`\`json sau alte formatări
- Răspunsul trebuie să fie JSON pur care poate fi parsat direct

IMPORTANT - INTERACTIVE FLOW:
- ÎNTREABĂ utilizatorul despre detalii lipsă (dată, locație, roluri, etc.) - OBLIGATORIU
- CERE confirmări înainte de a crea/actualiza evenimente - OBLIGATORIU
- Când utilizatorul spune "vreau să notez un eveniment" → returnează action:"START_NOTING"
- Când utilizatorul furnizează informații în timpul notării → returnează action:"UPDATE_DRAFT"
- Când toate detaliile sunt complete → REZUMĂ și returnează action:"ASK_INFO" cu mesaj de confirmare
- Când utilizatorul confirmă ("da", "ok", "confirm") → returnează action:"CREATE"

ACȚIUNI DISPONIBILE:
- START_NOTING: Începe procesul de notare interactivă
- UPDATE_DRAFT: Actualizează draft-ul cu informații noi
- ASK_INFO: Cere informații lipsă sau confirmare
- CREATE: Creează eveniment (doar după confirmare)
- UPDATE: Actualizează eveniment existent
- ARCHIVE: Arhivează eveniment
- LIST: Listează evenimente

REGULI DATE ȘI ORA:
- Data TREBUIE să fie în format DD-MM-YYYY (ex: 15-01-2026)
- Dacă user spune "mâine", "săptămâna viitoare" → returnează action:"ASK_INFO" cu mesaj care cere data exactă
- Ora TREBUIE să fie în format HH:mm (ex: 14:00)
- Durata poate fi în orice format (2 ore, 90 minute, 1.5 ore) - va fi normalizată

ROLURI DISPONIBILE:
- Animator (necesită: nume sărbătorit, data nașterii, personaj)
- Ursitoare (necesită: 3 sau 4, nume sărbătorit, data nașterii; durată fixă 60 min)
- Vată de zahăr, Popcorn, Vată + Popcorn
- Decorațiuni, Baloane, Baloane cu heliu
- Aranjamente de masă, Moș Crăciun, Gheață carbonică
- Arcadă, Pictură pe față, Șofer

ȘTERGEREA ESTE INTERZISĂ - folosește ARCHIVE în loc de DELETE.
`;

  if (conversationState && conversationState.notingMode) {
    prompt += `

CONTEXT CURENT - NOTING MODE ACTIV:
User este în proces de notare eveniment.
Draft curent: ${JSON.stringify(conversationState.draftEvent)}
Întrebări rămase: ${JSON.stringify(conversationState.pendingQuestions)}

Analizează mesajul user-ului și:
1. Extrage orice informații noi (dată, adresă, roluri, etc.)
2. Returnează action:"UPDATE_DRAFT" cu data extrasă
3. SAU dacă draft-ul este complet, returnează action:"ASK_INFO" cu rezumat și cerere de confirmare
`;
  }

  return prompt.trim();
}

async function extractInitialData(text, roleDetector, dateTimeParser) {
  const data = {};

  // Extract date
  const dateMatch = text.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  if (dateMatch) {
    const dateValidation = dateTimeParser.parseDate(dateMatch[0]);
    if (dateValidation && dateValidation.valid) {
      data.date = dateValidation.date;
    }
  }

  // Extract phone
  const phoneValidation = dateTimeParser.parsePhone(text);
  if (phoneValidation && phoneValidation.valid) {
    data.client = phoneValidation.phone;
  }

  // Extract roles
  const detectedRoles = await roleDetector.detectRoles(text);
  if (detectedRoles.length > 0) {
    data.rolesDraft = detectedRoles.map(dr => ({
      label: dr.label,
      slot: null, // Will be assigned later
      startTime: null,
      durationMinutes: dr.fixedDuration || null,
      details: roleDetector.extractRoleDetails(text, dr.roleKey),
    }));
  }

  return data;
}

async function extractUpdates(text, currentDraft, roleDetector, dateTimeParser) {
  const updates = {};

  // Extract date
  const dateMatch = text.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  if (dateMatch) {
    const dateValidation = dateTimeParser.parseDate(dateMatch[0]);
    if (dateValidation && dateValidation.valid) {
      updates.date = dateValidation.date;
    }
  }

  // Extract phone
  const phoneValidation = dateTimeParser.parsePhone(text);
  if (phoneValidation && phoneValidation.valid) {
    updates.client = phoneValidation.phone;
  }

  // Extract address (simple heuristic)
  const addressKeywords = ['adresa', 'locatia', 'locația', 'la'];
  const normalizedText = text.toLowerCase();
  for (const keyword of addressKeywords) {
    const index = normalizedText.indexOf(keyword);
    if (index !== -1) {
      // Extract text after keyword
      const afterKeyword = text.substring(index + keyword.length).trim();
      const addressMatch = afterKeyword.match(/^[:\s]*([^,\n]+)/);
      if (addressMatch) {
        updates.address = addressMatch[1].trim();
        break;
      }
    }
  }

  // Extract roles
  const detectedRoles = await roleDetector.detectRoles(text);
  if (detectedRoles.length > 0) {
    const existingRoles = currentDraft.rolesDraft || [];
    const newRoles = detectedRoles.map(dr => ({
      label: dr.label,
      slot: null,
      startTime: null,
      durationMinutes: dr.fixedDuration || null,
      details: roleDetector.extractRoleDetails(text, dr.roleKey),
    }));

    updates.rolesDraft = [...existingRoles, ...newRoles];
  }

  return updates;
}

async function processRoles(rolesDraft, eventShortCode, shortCodeGenerator) {
  const roles = [];

  for (let i = 0; i < rolesDraft.length; i++) {
    const draft = rolesDraft[i];
    const slot = shortCodeGenerator.generateRoleSlot(roles);
    const roleCode = shortCodeGenerator.generateRoleCode(eventShortCode, slot);

    roles.push({
      slot,
      roleCode,
      label: draft.label,
      startTime: draft.startTime || '14:00',
      durationMinutes: draft.durationMinutes || 120,
      details: draft.details || null,
      assignedCode: null,
      pendingCode: null,
    });
  }

  return roles;
}

function sanitizeUpdateFields(data) {
  const allowed = new Set([
    'date',
    'address',
    'client',
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
