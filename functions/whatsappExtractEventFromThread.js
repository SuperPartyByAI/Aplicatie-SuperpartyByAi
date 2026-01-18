'use strict';

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

// Groq SDK
const Groq = require('groq-sdk');

// Normalizers for V3 EN schema (reuse from chatEventOps)
const {normalizeEventFields, normalizeRoleFields, normalizeRoleType} = require('./normalizers');
const {getNextEventShortId} = require('./shortCodeGenerator');
const chatEventOps = require('./chatEventOps').chatEventOps;

// Define secret for GROQ API key
const groqApiKey = defineSecret('GROQ_API_KEY');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Extract event booking from WhatsApp thread messages
 * Input: { threadId, accountId, phoneE164, lastNMessages, dryRun=true|false }
 * Output: { action: CREATE_EVENT|UPDATE_EVENT|NOOP, draftEvent, targetEventId?, confidence, reasons }
 */
exports.whatsappExtractEventFromThread = onCall(
  {
    region: 'europe-west1', // Co-located with Firestore (eur3) for low latency
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 1, // Reduce CPU quota pressure
    secrets: [groqApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {threadId, accountId, phoneE164, lastNMessages = 50, dryRun = true} = request.data || {};

    if (!threadId || !accountId) {
      throw new HttpsError('invalid-argument', 'threadId and accountId are required');
    }

    // Access GROQ API key from secret
    const groqKey = groqApiKey.value();
    if (!groqKey) {
      console.error('[whatsappExtractEventFromThread] GROQ_API_KEY not available');
      throw new HttpsError('failed-precondition', 'GROQ_API_KEY not available');
    }

    try {
      // Fetch thread to verify it exists and get metadata
      const threadRef = db.collection('threads').doc(threadId);
      const threadDoc = await threadRef.get();
      
      if (!threadDoc.exists) {
        throw new HttpsError('not-found', `Thread ${threadId} not found`);
      }

      const threadData = threadDoc.data();
      if (threadData.accountId !== accountId) {
        throw new HttpsError('permission-denied', 'Thread does not belong to accountId');
      }

      // Fetch last N messages from thread (inbound only, sorted by timestamp)
      const messagesRef = threadRef.collection('messages');
      const messagesSnapshot = await messagesRef
        .where('direction', '==', 'inbound')
        .orderBy('tsClient', 'desc')
        .limit(lastNMessages)
        .get();

      if (messagesSnapshot.empty) {
        return {
          action: 'NOOP',
          confidence: 0,
          reasons: ['No inbound messages found in thread'],
        };
      }

      // Build conversation context from messages
      const messages = [];
      for (const doc of messagesSnapshot.docs) {
        const msg = doc.data();
        messages.unshift({
          id: doc.id,
          body: msg.body || '',
          timestamp: msg.tsClient?.toDate?.() || new Date(),
          from: msg.from || phoneE164,
        });
      }

      const conversationText = messages
        .map((m) => `${new Date(m.timestamp).toISOString()}: ${m.body}`)
        .join('\n');

      // Quick check: does conversation contain booking intent?
      const hasBookingKeywords = /(petrecere|eveniment|rezerv|comand|cât cost|când|dată|adresă|personaj|animator|ursitoare|vată)/i.test(
        conversationText
      );
      
      const hasAmount = /\d+.*(lei|ron|eur|euro)/i.test(conversationText);
      const hasDate = /\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}/.test(conversationText);

      if (!hasBookingKeywords && !hasAmount && !hasDate) {
        return {
          action: 'NOOP',
          confidence: 0,
          reasons: ['No booking intent detected in conversation'],
        };
      }

      // Use Groq to extract structured event data
      const groq = new Groq({apiKey: groqKey});
      
      const systemPrompt = `Analizează conversația WhatsApp și extrage structurat datele pentru o petrecere/eveniment.
      
Output JSON strict:
{
  "intent": "BOOKING" | "QUESTION" | "UPDATE" | "OTHER",
  "confidence": 0-1,
  "event": {
    "date": "DD-MM-YYYY" (sau null),
    "address": string (sau null),
    "childName": string (sau null),
    "childAge": number (sau null),
    "parentName": string (sau null),
    "payment": {
      "amount": number (sau null),
      "currency": "RON" | "EUR" (sau null),
      "status": "UNPAID" | "PAID" (default: "UNPAID")
    },
    "rolesBySlot": {
      "slot1": {
        "roleType": "animator" | "ursitoare" | "vata_de_zahar" | null,
        "startTime": "HH:MM" (sau null),
        "durationHours": number (sau null)
      }
    }
  },
  "reasons": [string array cu explicații]
}`;

      const userPrompt = `Conversație WhatsApp:
${conversationText}

Client phone: ${phoneE164}

Extrage date pentru petrecere (dacă există). Răspunde JSON strict.`;

      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages: [
          {role: 'system', content: systemPrompt},
          {role: 'user', content: userPrompt},
        ],
        max_tokens: 1000,
        temperature: 0.3,
        response_format: {type: 'json_object'},
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      let extraction;
      try {
        extraction = JSON.parse(responseText);
      } catch (e) {
        console.error('[whatsappExtractEventFromThread] Failed to parse Groq response:', responseText);
        throw new HttpsError('internal', 'Failed to parse AI extraction result');
      }

      if (extraction.intent !== 'BOOKING' || extraction.confidence < 0.5) {
        return {
          action: 'NOOP',
          confidence: extraction.confidence || 0,
          reasons: extraction.reasons || ['Low confidence or no booking intent'],
          draftEvent: extraction.event || null,
        };
      }

      // Normalize extracted event data using existing normalizers
      const normalizedEvent = normalizeEventFields(extraction.event || {});
      normalizedEvent.phoneE164 = phoneE164;
      normalizedEvent.phoneRaw = phoneE164.replace(/\+/g, '');

      // Check if we should CREATE or UPDATE existing event
      // Strategy: if date differs from latest open event for this client, CREATE NEW; otherwise UPDATE
      let targetEventId = null;
      let action = 'CREATE_EVENT';

      if (normalizedEvent.date) {
        // Find latest open event for this phoneE164
        const existingEventsSnapshot = await db
          .collection('evenimente')
          .where('phoneE164', '==', phoneE164)
          .where('isArchived', '==', false)
          .orderBy('date', 'desc')
          .limit(1)
          .get();

        if (!existingEventsSnapshot.empty) {
          const latestEvent = existingEventsSnapshot.docs[0];
          const latestEventData = latestEvent.data();
          const latestDate = latestEventData.date;

          // Compare dates (normalized to same format)
          if (latestDate === normalizedEvent.date || latestDate === normalizedEvent.date?.split('-').reverse().join('-')) {
            // Same date → UPDATE existing event
            targetEventId = latestEvent.id;
            action = 'UPDATE_EVENT';
          } else {
            // Different date → CREATE NEW event
            action = 'CREATE_EVENT';
          }
        }
      }

      // Generate idempotency key
      const lastMessageId = messages[messages.length - 1]?.id || 'unknown';
      const clientRequestId = crypto
        .createHash('sha256')
        .update(`${threadId}__${lastMessageId}`)
        .digest('hex')
        .substring(0, 16);

      // If dryRun, return preview
      if (dryRun) {
        return {
          action,
          draftEvent: normalizedEvent,
          targetEventId,
          confidence: extraction.confidence || 0.5,
          reasons: extraction.reasons || [],
          clientRequestId,
        };
      }

      // Execute CREATE or UPDATE using existing chatEventOps logic
      // For now, we'll use chatEventOps CREATE/UPDATE commands internally
      let result;

      if (action === 'CREATE_EVENT') {
        // Build chatEventOps command
        const eventText = `CREATE petrecere ${normalizedEvent.date ? `data ${normalizedEvent.date}` : ''} ${normalizedEvent.address || ''} ${normalizedEvent.childName || ''} ${normalizedEvent.payment?.amount ? `${normalizedEvent.payment.amount} ${normalizedEvent.payment.currency || 'RON'}` : ''}`.trim();
        
        // Call chatEventOps internally (but we need to pass userId context)
        // For now, return draft and let Flutter call chatEventOps with confirmation
        result = {
          action: 'CREATE_EVENT',
          draftEvent: {...normalizedEvent, clientRequestId},
          confidence: extraction.confidence || 0.5,
          reasons: extraction.reasons || [],
          clientRequestId,
          message: 'Use chatEventOps to create event from draftEvent',
        };
      } else {
        // UPDATE existing event
        result = {
          action: 'UPDATE_EVENT',
          draftEvent: normalizedEvent,
          targetEventId,
          confidence: extraction.confidence || 0.5,
          reasons: extraction.reasons || [],
          clientRequestId,
          message: 'Use chatEventOps UPDATE to update event from draftEvent',
        };
      }

      // Store extraction record for audit
      const extractionRef = threadRef.collection('extractions').doc(lastMessageId);
      await extractionRef.set({
        messageId: lastMessageId,
        threadId,
        accountId,
        clientJid: phoneE164,
        intent: extraction.intent,
        entities: extraction.event || {},
        confidence: extraction.confidence || 0.5,
        model: 'llama-3.1-70b-versatile',
        action,
        targetEventId,
        clientRequestId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      return result;
    } catch (error) {
      console.error('[whatsappExtractEventFromThread] Error:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Extraction failed: ${error.message}`);
    }
  }
);
