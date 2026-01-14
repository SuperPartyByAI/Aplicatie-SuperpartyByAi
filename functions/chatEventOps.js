'use strict';

/**
 * Legacy callable: chatEventOps
 *
 * SECURITY / MIGRATION:
 * - This endpoint is kept for backward compatibility, but it must NOT write to Firestore.
 * - All operational writes to `/evenimente/*` must go through `aiEventGateway`.
 * - Interpretation (LLM) must go through `chatEventOpsV2`.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');

const { requireAuth } = require('./authGuards');

exports.chatEventOps = onCall(
  { region: 'us-central1', timeoutSeconds: 60 },
  async (request) => {
    // Require auth (employee check is enforced by chatEventOpsV2 / aiEventGateway)
    requireAuth(request);

    const text = (request.data?.text || '').toString().trim();
    if (!text) throw new HttpsError('invalid-argument', 'Lipsește "text".');

    // Forward to V2 interpreter (NO direct Firestore writes here).
    const { chatEventOpsV2 } = require('./chatEventOpsV2');
    const v2Res = await chatEventOpsV2({
      data: {
        text,
        sessionId: request.data?.sessionId,
        eventId: request.data?.eventId,
        dryRun: request.data?.dryRun === true,
      },
      auth: request.auth,
      rawRequest: request.rawRequest,
    });

    // If interpreter indicates auto-execution, execute ops via the single writer.
    if (v2Res && v2Res.autoExecute === true && Array.isArray(v2Res.ops) && v2Res.ops.length) {
      const { aiEventGateway } = require('./aiEventGateway');

      const sessionId =
        (request.data?.sessionId || v2Res.sessionId || '').toString().trim() ||
        `session_${request.auth.uid}_${Date.now()}`;

      const executed = [];
      for (const opEntry of v2Res.ops) {
        if (!opEntry || typeof opEntry !== 'object') continue;
        const op = (opEntry.op || '').toString();
        const payload = opEntry.payload || {};
        const requestId =
          (opEntry.requestId || '').toString().trim() ||
          `${sessionId}_${Date.now()}_${op}`;

        const gwRes = await aiEventGateway({
          data: { sessionId, requestId, op, payload },
          auth: request.auth,
          rawRequest: request.rawRequest,
        });
        executed.push(gwRes);
      }

      return { ...v2Res, executed };
    }

    return v2Res;
  }
);

