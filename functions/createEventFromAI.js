const {onCall} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Groq = require('groq-sdk');

const groqApiKey = defineSecret('GROQ_API_KEY');

exports.createEventFromAI = onCall(
  {
    timeoutSeconds: 30,
    memory: '512MiB',
    secrets: [groqApiKey],
  },
  async request => {
    const {text} = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!text) {
      throw new functions.https.HttpsError('invalid-argument', 'Text is required');
    }

    try {
      const groqKey = groqApiKey.value().trim().replace(/[\r\n\t]/g, '');
      const groq = new Groq({apiKey: groqKey});

      const systemPrompt = 'Ești un asistent care extrage informații despre evenimente din text. Răspunde DOAR cu JSON valid.';

      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages: [
          {role: 'system', content: systemPrompt},
          {role: 'user', content: text},
        ],
        max_tokens: 500,
        temperature: 0.1,
        response_format: {type: 'json_object'},
      });

      const aiResponse = completion.choices[0]?.message?.content;
      const eventData = JSON.parse(aiResponse);

      const db = admin.firestore();
      const eventRef = db.collection('evenimente').doc();

      // Use normalizers for V3 EN schema
      const { normalizeEventFields } = require('./normalizers');
      const { getNextEventShortId, getNextFreeSlot } = require('./shortCodeGenerator');
      
      const eventShortId = await getNextEventShortId();
      const normalized = normalizeEventFields({
        ...eventData,
        eventShortId,
      });

      // Convert roles[] to rolesBySlot if needed
      let rolesBySlot = normalized.rolesBySlot || {};
      if (Array.isArray(eventData.roles) && eventData.roles.length > 0) {
        rolesBySlot = {};
        for (let i = 0; i < eventData.roles.length; i++) {
          const slot = getNextFreeSlot(eventShortId, rolesBySlot);
          rolesBySlot[slot] = eventData.roles[i];
        }
      }

      const event = {
        schemaVersion: 3,
        eventShortId,
        date: normalized.date,
        address: normalized.address,
        phoneE164: normalized.phoneE164,
        phoneRaw: normalized.phoneRaw,
        childName: normalized.childName,
        childAge: normalized.childAge,
        childDob: normalized.childDob,
        parentName: normalized.parentName,
        parentPhone: normalized.parentPhone,
        numChildren: normalized.numChildren,
        rolesBySlot,
        payment: normalized.payment || {
          status: 'UNPAID',
          method: null,
          amount: 0,
        },
        isArchived: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId,
      };

      await eventRef.set(event);

      return {
        success: true,
        eventId: eventRef.id,
        message: 'Eveniment creat cu succes!',
      };
    } catch (error) {
      console.error('Error in createEventFromAI:', error);
      throw new functions.https.HttpsError('internal', 'Eroare: ' + error.message);
    }
  }
);
