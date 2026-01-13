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
const { getEffectiveConfig } = require('./aiConfigManager');
const aiSessionLogger = require('./aiSessionLogger');

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
    if (!employeeInfo.isEmployee) {
      throw new HttpsError('permission-denied', 'Doar angajații pot gestiona evenimente prin AI.');
    }

    const text = (request.data?.text || '').toString().trim();
    if (!text) throw new HttpsError('invalid-argument', 'Lipsește "text".');

    const sessionId = request.data?.sessionId || `session_${uid}_${Date.now()}`;
    const dryRun = request.data?.dryRun === true;
    const requestEventId = request.data?.eventId ? String(request.data.eventId).trim() : null;

    const db = admin.firestore();

    // Load AI logic config (global + optional per-event override)
    let logEventId = requestEventId || null;
    let { effective: effectiveConfig, meta: effectiveConfigMeta } = await getEffectiveConfig(db, { eventId: logEventId });

    // Start/merge session (temp session when eventId not known yet)
    await aiSessionLogger.startSession(db, {
      eventId: logEventId,
      sessionId,
      actorUid: uid,
      actorEmail: email,
      actionType: 'chatEventOpsV2',
      configMeta: effectiveConfigMeta,
    });

    const logAssistant = async (message, extra = null) => {
      await aiSessionLogger.appendMessage(db, {
        eventId: logEventId,
        sessionId,
        role: 'assistant',
        text: message,
        extra,
      });
    };

    const logUser = async (message, extra = null) => {
      await aiSessionLogger.appendMessage(db, {
        eventId: logEventId,
        sessionId,
        role: 'user',
        text: message,
        extra,
      });
    };

    const isSuperAdmin = employeeInfo.isSuperAdmin === true;
    const makeDebug = (payload) => (isSuperAdmin ? payload : undefined);

    await logUser(text, { uid, email, dryRun, requestEventId: requestEventId || null });

    // Initialize helper modules
    const stateManager = new ConversationStateManager(db);
    const roleDetector = new RoleDetector(db);
    const dateTimeParser = new DateTimeParser();
    const eventIdentifier = new EventIdentifier(db);
    const shortCodeGenerator = new ShortCodeGenerator(db);

    const resolveEventId = async (preferredEventId) => {
      const candidate = preferredEventId ? String(preferredEventId).trim() : null;
      if (candidate) return { eventId: candidate };

      // Try phone-based identification (future events)
      const phoneValidation = dateTimeParser.parsePhone(text);
      const phone = phoneValidation && phoneValidation.valid ? phoneValidation.phone : null;
      if (!phone) {
        return {
          ask: {
            ok: true,
            action: 'ASK_INFO',
            message:
              'Pentru această operațiune am nevoie de evenimentul țintă. Spune-mi codul evenimentului sau numărul de telefon al clientului.',
            dryRun: true,
            debug: makeDebug({ reason: 'missing_eventId_and_phone' }),
          },
        };
      }

      const events = await eventIdentifier.findFutureEvents(phone);
      if (events.length === 0) {
        return {
          ask: {
            ok: true,
            action: 'ASK_INFO',
            message:
              'Nu am găsit evenimente viitoare pentru acest număr. Spune-mi codul evenimentului sau data (DD-MM-YYYY) pentru a identifica evenimentul.',
            dryRun: true,
            debug: makeDebug({ reason: 'no_future_events', phone }),
          },
        };
      }

      if (events.length === 1) {
        return { eventId: events[0].id, matched: events[0] };
      }

      return {
        ask: {
          ok: true,
          action: 'ASK_INFO',
          message: eventIdentifier._formatMultipleEventsMessage(events),
          dryRun: true,
          debug: makeDebug({ reason: 'ambiguous_events', phone, events }),
        },
      };
    };

    const ensureEventContext = async (eventId) => {
      const eid = eventId ? String(eventId).trim() : null;
      if (!eid) return;
      if (logEventId) return;

      logEventId = eid;
      await aiSessionLogger.attachTempSessionToEvent(db, { sessionId, eventId: logEventId });
      ({ effective: effectiveConfig, meta: effectiveConfigMeta } = await getEffectiveConfig(db, { eventId: logEventId }));
      await aiSessionLogger.startSession(db, {
        eventId: logEventId,
        sessionId,
        actorUid: uid,
        actorEmail: email,
        actionType: 'chatEventOpsV2',
        configMeta: effectiveConfigMeta,
      });
    };

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
        await logAssistant('✅ Am anulat notarea evenimentului. Cu ce te pot ajuta?', { action: 'CANCELLED' });
        await aiSessionLogger.endSession(db, { eventId: logEventId, sessionId, status: 'CANCELLED' });
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
    const systemPrompt = buildSystemPrompt(conversationState, effectiveConfig);

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
      await aiSessionLogger.appendStep(db, {
        eventId: logEventId,
        sessionId,
        step: {
          kind: 'ai_parse_failed',
          raw,
          draftSnapshot: conversationState?.draftEvent || null,
          pendingQuestions: conversationState?.pendingQuestions || null,
        },
      });
      return {
        ok: false,
        action: 'NONE',
        message: 'Nu am putut interpreta comanda. Te rog să reformulezi.',
        raw,
      };
    }

    const action = String(cmd.action || 'NONE').toUpperCase();

    // If the AI identified a target eventId, attach temp session to event and reload config with override.
    const cmdEventId = cmd.eventId ? String(cmd.eventId).trim() : null;
    if (!logEventId && cmdEventId) {
      logEventId = cmdEventId;
      await aiSessionLogger.attachTempSessionToEvent(db, { sessionId, eventId: logEventId });
      ({ effective: effectiveConfig, meta: effectiveConfigMeta } = await getEffectiveConfig(db, { eventId: logEventId }));
      await aiSessionLogger.startSession(db, {
        eventId: logEventId,
        sessionId,
        actorUid: uid,
        actorEmail: email,
        actionType: 'chatEventOpsV2',
        configMeta: effectiveConfigMeta,
      });
    }

    await aiSessionLogger.appendStep(db, {
      eventId: logEventId,
      sessionId,
      step: {
        kind: 'ai_command',
        action,
        cmd,
        raw,
        draftSnapshot: conversationState?.draftEvent || null,
        pendingQuestions: conversationState?.pendingQuestions || null,
        configMeta: effectiveConfigMeta,
      },
    });

    // Handle ASK_INFO (AI needs more information)
    if (action === 'ASK_INFO') {
      await logAssistant(cmd.message || 'Am nevoie de mai multe informații.', { action: 'ASK_INFO' });

      return {
        ok: true,
        action: 'ASK_INFO',
        message: cmd.message || 'Am nevoie de mai multe informații.',
        dryRun: true,
        debug: makeDebug({
          draftEvent: conversationState?.draftEvent || null,
          pendingQuestions: conversationState?.pendingQuestions || null,
          effectiveConfigMeta,
          cmd,
          raw,
        }),
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
        await logAssistant(nextQuestion.question, { action: 'START_NOTING' });
        return {
          ok: true,
          action: 'START_NOTING',
          message: nextQuestion.question,
          ...(isSuperAdmin ? { draftEvent: conversationState.draftEvent } : {}),
          debug: makeDebug({
            draftEvent: conversationState.draftEvent,
            pendingQuestions: conversationState.pendingQuestions,
            effectiveConfigMeta,
          }),
        };
      }

      // If no questions, ready for confirmation
      const summary = stateManager.generateConfirmationSummary(conversationState.draftEvent);
      await logAssistant(summary, { action: 'CONFIRM' });

      return {
        ok: true,
        action: 'CONFIRM',
        message: summary,
        ...(isSuperAdmin ? { draftEvent: conversationState.draftEvent } : {}),
        debug: makeDebug({
          draftEvent: conversationState.draftEvent,
          pendingQuestions: conversationState.pendingQuestions,
          effectiveConfigMeta,
        }),
      };
    }

    // Handle UPDATE_DRAFT (user provides more information while in noting mode)
    if (action === 'UPDATE_DRAFT' && conversationState && conversationState.notingMode) {
      // Extract updates from user input
      const updates = await extractUpdates(text, conversationState.draftEvent, roleDetector, dateTimeParser);

      conversationState = await stateManager.updateDraft(sessionId, updates);

      // Check if ready for confirmation
      if (stateManager.isReadyForConfirmation(conversationState.draftEvent)) {
        const summary = stateManager.generateConfirmationSummary(conversationState.draftEvent);
        await logAssistant(summary, { action: 'CONFIRM' });

        return {
          ok: true,
          action: 'CONFIRM',
          message: summary,
          ...(isSuperAdmin ? { draftEvent: conversationState.draftEvent } : {}),
          debug: makeDebug({
            draftEvent: conversationState.draftEvent,
            pendingQuestions: conversationState.pendingQuestions,
            effectiveConfigMeta,
          }),
        };
      }

      // Ask next question
      const nextQuestion = stateManager.getNextQuestion(conversationState);
      if (nextQuestion) {
        await logAssistant(nextQuestion.question, { action: 'UPDATE_DRAFT' });
        return {
          ok: true,
          action: 'UPDATE_DRAFT',
          message: nextQuestion.question,
          ...(isSuperAdmin ? { draftEvent: conversationState.draftEvent } : {}),
          debug: makeDebug({
            draftEvent: conversationState.draftEvent,
            pendingQuestions: conversationState.pendingQuestions,
            effectiveConfigMeta,
          }),
        };
      }

      return {
        ok: true,
        action: 'UPDATE_DRAFT',
        message: 'Am actualizat informațiile. Mai ai ceva de adăugat?',
        ...(isSuperAdmin ? { draftEvent: conversationState.draftEvent } : {}),
        debug: makeDebug({
          draftEvent: conversationState.draftEvent,
          pendingQuestions: conversationState.pendingQuestions,
          effectiveConfigMeta,
        }),
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
          ...(isSuperAdmin ? { data: eventDoc } : {}),
          message: 'Preview: Evenimentul ar fi creat (dryRun).',
          dryRun: true,
          debug: makeDebug({
            effectiveConfigMeta,
            eventDoc,
          }),
        };
      }

      const ref = await db.collection('evenimente').add(eventDoc);
      const createdEventId = ref.id;

      // Attach temp session logs to the newly created event
      if (!logEventId) {
        await aiSessionLogger.attachTempSessionToEvent(db, { sessionId, eventId: createdEventId });
        logEventId = createdEventId;
      }

      // Clear conversation state
      if (conversationState && conversationState.notingMode) {
        await stateManager.cancelNotingMode(sessionId);
      }

      await logAssistant(
        `✅ Eveniment creat cu succes!\n📋 Cod: ${shortCode}\n📅 Data: ${dateValidation.date}\n📍 Adresa: ${data.address}`,
        { action: 'CREATE', eventId: createdEventId, shortCode }
      );
      await aiSessionLogger.endSession(db, { eventId: logEventId, sessionId, status: 'DONE', createdEventId });

      return {
        ok: true,
        action: 'CREATE',
        eventId: createdEventId,
        shortCode,
        message: `✅ Eveniment creat cu succes!\n📋 Cod: ${shortCode}\n📅 Data: ${dateValidation.date}\n📍 Adresa: ${data.address}`,
        dryRun: false,
        debug: makeDebug({
          effectiveConfigMeta,
          createdEventId,
          shortCode,
          eventDocPreview: dryRun ? eventDoc : undefined,
        }),
      };
    }

    // Handle UPDATE_EVENT_FIELDS (update existing event)
    if (action === 'UPDATE' || action === 'UPDATE_EVENT_FIELDS') {
      const resolved = await resolveEventId(cmd.eventId || logEventId);
      if (resolved.ask) {
        await logAssistant(resolved.ask.message, { action: 'ASK_INFO' });
        return resolved.ask;
      }
      const eventId = resolved.eventId;
      await ensureEventContext(eventId);

      const patch = sanitizeUpdateFields(cmd.data || {});
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      patch.updatedBy = uid;

      if (dryRun) {
        return {
          ok: true,
          action: 'UPDATE_EVENT_FIELDS',
          eventId,
          data: patch,
          message: `Preview: Eveniment ${eventId} va fi actualizat`,
          dryRun: true,
          debug: makeDebug({ effectiveConfigMeta, cmd }),
        };
      }

      await db.collection('evenimente').doc(eventId).update(patch);
      await db.collection('evenimente').doc(eventId).collection('audit').add({
        action: 'UPDATE_EVENT_FIELDS',
        actorUid: uid,
        actorEmail: email,
        patch,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await logAssistant(`✅ Eveniment actualizat.`, { action: 'UPDATE_EVENT_FIELDS', eventId, patch });
      await aiSessionLogger.endSession(db, { eventId: logEventId || eventId, sessionId, status: 'DONE' });

      return {
        ok: true,
        action: 'UPDATE_EVENT_FIELDS',
        eventId,
        message: `✅ Eveniment actualizat.`,
        dryRun: false,
        debug: makeDebug({ effectiveConfigMeta }),
      };
    }

    // Role operations (v2 roles[] only; schemaVersion 3 can be added later if needed)
    if (
      action === 'ADD_ROLE' ||
      action === 'UPDATE_ROLE' ||
      action === 'REMOVE_ROLE' ||
      action === 'ASSIGN_ROLE_CODE' ||
      action === 'UNASSIGN_ROLE_CODE' ||
      action === 'ACCEPT_PENDING' ||
      action === 'REJECT_PENDING'
    ) {
      const resolved = await resolveEventId(cmd.eventId || logEventId);
      if (resolved.ask) {
        await logAssistant(resolved.ask.message, { action: 'ASK_INFO' });
        return resolved.ask;
      }
      const eventId = resolved.eventId;
      await ensureEventContext(eventId);

      const slot = cmd.slot ? String(cmd.slot).trim() : cmd.data?.slot ? String(cmd.data.slot).trim() : null;
      const code = cmd.code ? String(cmd.code).trim() : cmd.data?.code ? String(cmd.data.code).trim() : null;
      const roleInput = cmd.role || cmd.data?.role || cmd.data || {};

      if (action !== 'ADD_ROLE' && !slot) {
        return { ok: false, action: 'NONE', message: `${action} necesită slot.` };
      }
      if (action === 'ASSIGN_ROLE_CODE' && !code) {
        return { ok: false, action: 'NONE', message: 'ASSIGN_ROLE_CODE necesită code.' };
      }

      if (dryRun) {
        return {
          ok: true,
          action,
          eventId,
          message: `Preview: ${action} va fi aplicat.`,
          dryRun: true,
          debug: makeDebug({ effectiveConfigMeta, cmd }),
        };
      }

      await db.runTransaction(async (tx) => {
        const ref = db.collection('evenimente').doc(eventId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'Evenimentul nu există.');

        const ev = snap.data() || {};
        const roles = Array.isArray(ev.roles) ? [...ev.roles] : [];

        if (action === 'ADD_ROLE') {
          const label = roleInput.label ? String(roleInput.label).trim() : null;
          if (!label) throw new HttpsError('invalid-argument', 'ADD_ROLE necesită role.label.');
          const eventShortCode = ev.shortCode || ev.eventShortCode;
          if (!eventShortCode) throw new HttpsError('failed-precondition', 'Eveniment fără shortCode.');

          const newSlot = shortCodeGenerator.generateRoleSlot(roles);
          const roleCode = shortCodeGenerator.generateRoleCode(eventShortCode, newSlot);
          roles.push({
            slot: newSlot,
            roleCode,
            label,
            startTime: roleInput.startTime || '14:00',
            durationMinutes: roleInput.durationMinutes || 120,
            details: roleInput.details || null,
            assignedCode: null,
            pendingCode: null,
          });
        } else {
          const idx = roles.findIndex(r => String(r.slot || '').trim() === slot);
          if (idx === -1) throw new HttpsError('not-found', `Rolul ${slot} nu există.`);

          if (action === 'UPDATE_ROLE') {
            const next = { ...roles[idx] };
            if (roleInput.label !== null && roleInput.label !== undefined) next.label = String(roleInput.label);
            if (roleInput.startTime !== null && roleInput.startTime !== undefined) next.startTime = String(roleInput.startTime);
            if (roleInput.durationMinutes !== null && roleInput.durationMinutes !== undefined) {
              next.durationMinutes = Number(roleInput.durationMinutes) || next.durationMinutes;
            }
            if (roleInput.details !== null && roleInput.details !== undefined) next.details = roleInput.details;
            roles[idx] = next;
          } else if (action === 'REMOVE_ROLE') {
            roles.splice(idx, 1);
          } else if (action === 'ASSIGN_ROLE_CODE') {
            roles[idx] = { ...roles[idx], pendingCode: code.toUpperCase() };
          } else if (action === 'UNASSIGN_ROLE_CODE') {
            roles[idx] = { ...roles[idx], assignedCode: null, pendingCode: null };
          } else if (action === 'ACCEPT_PENDING') {
            const pending = roles[idx].pendingCode;
            roles[idx] = { ...roles[idx], assignedCode: pending || roles[idx].assignedCode || null, pendingCode: null };
          } else if (action === 'REJECT_PENDING') {
            roles[idx] = { ...roles[idx], pendingCode: null };
          }
        }

        tx.update(ref, {
          roles,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: uid,
        });
      });

      await db.collection('evenimente').doc(eventId).collection('audit').add({
        action,
        actorUid: uid,
        actorEmail: email,
        slot: slot || null,
        code: code || null,
        role: action === 'ADD_ROLE' || action === 'UPDATE_ROLE' ? roleInput : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await logAssistant(`✅ ${action} aplicat.`, { action, eventId, slot: slot || null });
      await aiSessionLogger.endSession(db, { eventId: logEventId || eventId, sessionId, status: 'DONE' });

      return { ok: true, action, eventId, message: `✅ ${action} aplicat.`, dryRun: false, debug: makeDebug({ effectiveConfigMeta }) };
    }

    // Handle ARCHIVE / UNARCHIVE
    if (action === 'ARCHIVE' || action === 'ARCHIVE_EVENT' || action === 'UNARCHIVE_EVENT') {
      const resolved = await resolveEventId(cmd.eventId || logEventId);
      if (resolved.ask) {
        await logAssistant(resolved.ask.message, { action: 'ASK_INFO' });
        return resolved.ask;
      }
      const eventId = resolved.eventId;
      await ensureEventContext(eventId);

      const update = {
        isArchived: action !== 'UNARCHIVE_EVENT',
        ...(action !== 'UNARCHIVE_EVENT'
          ? {
              archivedAt: admin.firestore.FieldValue.serverTimestamp(),
              archivedBy: uid,
              ...(cmd.reason ? { archiveReason: String(cmd.reason) } : {}),
            }
          : {
              unarchivedAt: admin.firestore.FieldValue.serverTimestamp(),
              unarchivedBy: uid,
            }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      };

      if (dryRun) {
        return {
          ok: true,
          action,
          eventId,
          message: `Preview: ${action} va fi aplicat pe ${eventId}`,
          dryRun: true,
          debug: makeDebug({ effectiveConfigMeta, cmd }),
        };
      }

      await db.collection('evenimente').doc(eventId).update(update);
      await db.collection('evenimente').doc(eventId).collection('audit').add({
        action,
        actorUid: uid,
        actorEmail: email,
        update,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await logAssistant(`✅ ${action} aplicat.`, { action, eventId });
      await aiSessionLogger.endSession(db, { eventId: logEventId || eventId, sessionId, status: 'DONE' });

      return {
        ok: true,
        action,
        eventId,
        message: `✅ ${action} aplicat.`,
        dryRun: false,
        debug: makeDebug({ effectiveConfigMeta }),
      };
    }

    // Handle LIST
    if (action === 'LIST') {
      const limit = Math.max(1, Math.min(50, Number(cmd.limit || 10)));

      let snap;
      try {
        snap = await db
          .collection('evenimente')
          .where('isArchived', '==', false)
          .orderBy('dateKey', 'desc')
          .limit(limit)
          .get();
      } catch (e) {
        snap = await db
          .collection('evenimente')
          .where('isArchived', '==', false)
          .orderBy('date', 'desc')
          .limit(limit)
          .get();
      }

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

function buildSystemPrompt(conversationState, effectiveConfig) {
  const cfg = effectiveConfig || {};

  const defaultPrompt = `
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
- Când toate detaliile sunt complete → REZUMĂ și returnează action:"ASK_INFO" (confirmare)
- Când utilizatorul confirmă ("da", "ok", "confirm") → returnează action:"CREATE"

ACȚIUNI DISPONIBILE:
- START_NOTING
- UPDATE_DRAFT
- ASK_INFO
- CREATE
- UPDATE_EVENT_FIELDS
- ADD_ROLE
- UPDATE_ROLE
- REMOVE_ROLE
- ASSIGN_ROLE_CODE
- UNASSIGN_ROLE_CODE
- ACCEPT_PENDING
- REJECT_PENDING
- ARCHIVE_EVENT
- UNARCHIVE_EVENT
- LIST

REGULI:
- Data TREBUIE să fie DD-MM-YYYY (ex: 15-01-2026)
- Ora TREBUIE să fie HH:mm (ex: 14:00)
- ȘTERGEREA ESTE INTERZISĂ (nu există DELETE).

ROLURI (exemple):
- Animator, Ursitoare, Vată de zahăr, Popcorn, Decorațiuni, Baloane, Arcadă etc.
`;

  let prompt = (cfg.systemPrompt && String(cfg.systemPrompt).trim()) || defaultPrompt;
  if (cfg.systemPromptAppend && String(cfg.systemPromptAppend).trim()) {
    prompt += `\n\n${String(cfg.systemPromptAppend).trim()}\n`;
  }

  if (conversationState && conversationState.notingMode) {
    prompt += `

CONTEXT CURENT - NOTING MODE ACTIV:
Draft curent: ${JSON.stringify(conversationState.draftEvent)}
Întrebări rămase: ${JSON.stringify(conversationState.pendingQuestions)}

Instrucțiuni:
1) Extrage orice informații noi și returnează action:"UPDATE_DRAFT" cu data extrasă
2) Dacă draft-ul este complet, returnează action:"ASK_INFO" cu rezumat și cerere de confirmare
3) Doar după confirmare: action:"CREATE"
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
