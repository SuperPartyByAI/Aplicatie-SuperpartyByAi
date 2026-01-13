/**
 * aiEventGateway.js
 *
 * Single callable entrypoint for event operations from the client.
 *
 * Implementation strategy (production-safe, minimal duplication):
 * - Delegate operational logic + server-only writes + ai_sessions logging to chatEventOpsV2.
 * - Adapt response into the strict client contract: {action,message,draft,missing,ui,...}
 */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const groqApiKey = defineSecret('GROQ_API_KEY');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Trebuie să fii autentificat.');
}

function _mapAction(v2Action) {
  const a = (v2Action || '').toString().toUpperCase();
  if (a === 'CANCELLED') return 'CANCELLED';
  if (a === 'ASK_INFO') return 'ASK_INFO';
  if (a === 'START_NOTING') return 'START_NOTING';
  if (a === 'UPDATE_DRAFT') return 'UPDATE_DRAFT';
  if (a === 'CONFIRM') return 'CONFIRM';
  if (a === 'CREATE') return 'CREATE';
  if (a === 'UPDATE' || a === 'UPDATE_EVENT_FIELDS') return 'UPDATE';
  if (
    a === 'ADD_ROLE' ||
    a === 'UPDATE_ROLE' ||
    a === 'REMOVE_ROLE' ||
    a === 'ASSIGN_ROLE_CODE' ||
    a === 'UNASSIGN_ROLE_CODE' ||
    a === 'ACCEPT_PENDING' ||
    a === 'REJECT_PENDING'
  ) {
    return 'ASSIGN_ROLE';
  }
  if (a === 'ARCHIVE' || a === 'ARCHIVE_EVENT' || a === 'UNARCHIVE_EVENT') return 'ARCHIVE';
  return 'ASK_INFO';
}

function _defaultButtonsFor(action) {
  if (action === 'CONFIRM') {
    return [
      { id: 'confirm', label: 'Confirmă', sendText: 'da', style: 'primary' },
      { id: 'cancel', label: 'Anulează', sendText: 'anulează', style: 'secondary' },
    ];
  }
  if (action === 'ASK_INFO') {
    return [{ id: 'cancel', label: 'Anulează', sendText: 'anulează', style: 'secondary' }];
  }
  return [];
}

exports.aiEventGateway = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    secrets: [groqApiKey],
  },
  async (request) => {
    requireAuth(request);

    const { chatEventOpsV2 } = require('./chatEventOpsV2');

    const text = (request.data?.text || '').toString().trim();
    if (!text) throw new HttpsError('invalid-argument', 'Lipsește "text".');

    // Delegate to V2 (server-only writes + ai_sessions logging + employee gate)
    const v2Result = await chatEventOpsV2({
      data: {
        text,
        sessionId: request.data?.sessionId,
        eventId: request.data?.eventId,
        dryRun: false,
        mode: request.data?.mode || 'AUTO',
        clientRequestId: request.data?.clientRequestId,
      },
      auth: request.auth,
      rawRequest: request.rawRequest,
    });

    const ok = v2Result?.ok === true;
    const mappedAction = _mapAction(v2Result?.action);
    const message = (v2Result?.message || '').toString() || (ok ? '✅ OK' : 'Nu am putut procesa cererea.');

    const ui = v2Result?.ui && typeof v2Result.ui === 'object'
      ? v2Result.ui
      : { buttons: _defaultButtonsFor(mappedAction) };

    const debug = v2Result?.debug;

    // Contract response
    return {
      action: mappedAction,
      message,
      eventId: v2Result?.eventId || request.data?.eventId || null,
      shortCode: v2Result?.shortCode || null,
      draft: debug?.draftEvent ? { event: debug.draftEvent, roles: [] } : undefined,
      missing: Array.isArray(debug?.pendingQuestions)
        ? debug.pendingQuestions.map((q) => ({
            path: q.field ? String(q.field) : 'unknown',
            question: q.question ? String(q.question) : '',
            priority: q.priority === 'high' ? 1 : 2,
          }))
        : undefined,
      ui,
      // Super-admin only: v2Result already hides debug for non-superadmin.
      debug,
    };
  }
);

