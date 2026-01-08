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

      const event = {
        date: eventData.date,
        address: eventData.address,
        tipEveniment: eventData.tipEveniment || 'Animație',
        telefon: eventData.telefon || null,
        email: eventData.email || null,
        observatii: eventData.observatii || null,
        numarCopii: eventData.numarCopii || null,
        numarAdulti: eventData.numarAdulti || null,
        sarbatoritNume: eventData.sarbatoritNume || '',
        sarbatoritVarsta: eventData.sarbatoritVarsta || 0,
        sarbatoritDob: eventData.sarbatoritDob || null,
        cineNoteaza: null,
        sofer: null,
        soferPending: null,
        roles: eventData.roles || [],
        incasare: {
          status: 'NEINCASAT',
          metoda: null,
          suma: null,
        },
        schemaVersion: 2,
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
