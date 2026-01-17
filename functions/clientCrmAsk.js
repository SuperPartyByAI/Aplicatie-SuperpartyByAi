'use strict';

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');

// Groq SDK
const Groq = require('groq-sdk');

// Define secret for GROQ API key
const groqApiKey = defineSecret('GROQ_API_KEY');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Answer AI questions about a client based on structured data (clients + evenimente)
 * Input: { phoneE164, question }
 * Output: { answer, sources: [{eventShortId, date, details}] }
 */
exports.clientCrmAsk = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '512MiB',
    maxInstances: 1, // Reduce CPU quota pressure
    secrets: [groqApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {phoneE164, question} = request.data || {};

    if (!phoneE164 || !question) {
      throw new HttpsError('invalid-argument', 'phoneE164 and question are required');
    }

    // Access GROQ API key from secret
    const groqKey = groqApiKey.value();
    if (!groqKey) {
      console.error('[clientCrmAsk] GROQ_API_KEY not available');
      throw new HttpsError('failed-precondition', 'GROQ_API_KEY not available');
    }

    try {
      // Fetch client profile
      const clientRef = db.collection('clients').doc(phoneE164);
      const clientDoc = await clientRef.get();
      
      const clientData = clientDoc.exists ? clientDoc.data() : {
        phoneE164,
        lifetimeSpendPaid: 0,
        lifetimeSpendAll: 0,
        eventsCount: 0,
        lastEventAt: null,
      };

      // Fetch all events for this client (ordered by date desc, limit 20)
      const eventsSnapshot = await db
        .collection('evenimente')
        .where('phoneE164', '==', phoneE164)
        .orderBy('date', 'desc')
        .limit(20)
        .get();

      const events = [];
      for (const doc of eventsSnapshot.docs) {
        const eventData = doc.data();
        events.push({
          eventId: doc.id,
          eventShortId: eventData.eventShortId || null,
          date: eventData.date || null,
          address: eventData.address || null,
          childName: eventData.childName || null,
          childAge: eventData.childAge || null,
          payment: eventData.payment || {},
          rolesBySlot: eventData.rolesBySlot || {},
          isArchived: eventData.isArchived || false,
        });
      }

      // Build context for AI
      const context = {
        client: {
          phoneE164: clientData.phoneE164,
          displayName: clientData.displayName || null,
          lifetimeSpendPaid: clientData.lifetimeSpendPaid || 0,
          lifetimeSpendAll: clientData.lifetimeSpendAll || 0,
          eventsCount: clientData.eventsCount || 0,
          lastEventAt: clientData.lastEventAt?.toDate?.()?.toISOString() || null,
        },
        events: events.map((e) => ({
          eventShortId: e.eventShortId,
          date: e.date,
          address: e.address,
          childName: e.childName,
          childAge: e.childAge,
          paymentAmount: e.payment.amount || 0,
          paymentStatus: e.payment.status || 'UNPAID',
          isArchived: e.isArchived,
        })),
      };

      // Use Groq to answer question based on structured data
      const groq = new Groq({apiKey: groqKey});

      const systemPrompt = `Ești un asistent CRM care răspunde la întrebări despre clienți bazat pe date structurate (evenimente, cheltuieli).

Reguli:
- Răspunde DOAR bazat pe datele furnizate (client + events).
- Când menționezi evenimente, citează întotdeauna eventShortId și data (ex: "Eveniment #123 din 15-01-2026").
- Pentru cheltuieli totale, folosește client.lifetimeSpendPaid (sumă plătită) sau client.lifetimeSpendAll (total inclusiv neplătit).
- Răspunde în română, concis și precis.

Output JSON strict:
{
  "answer": "string (răspuns în română)",
  "sources": [
    {
      "eventShortId": number (sau null),
      "date": "DD-MM-YYYY",
      "details": "string (descriere scurtă)"
    }
  ]
}`;

      const userPrompt = `Client: ${JSON.stringify(context.client)}
Evenimente: ${JSON.stringify(context.events)}

Întrebare: ${question}

Răspunde bazat pe datele furnizate. Răspunde JSON strict.`;

      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages: [
          {role: 'system', content: systemPrompt},
          {role: 'user', content: userPrompt},
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: {type: 'json_object'},
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error('[clientCrmAsk] Failed to parse Groq response:', responseText);
        throw new HttpsError('internal', 'Failed to parse AI response');
      }

      return {
        answer: result.answer || 'Nu am găsit informații relevante.',
        sources: result.sources || [],
      };
    } catch (error) {
      console.error('[clientCrmAsk] Error:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `AI query failed: ${error.message}`);
    }
  }
);
