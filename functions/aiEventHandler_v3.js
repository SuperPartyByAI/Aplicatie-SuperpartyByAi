'use strict';

/**
 * AI Event Handler V3 - Complete with Confirmation Flow
 * 
 * Flow:
 * 1. LLM produces proposal (dry-run)
 * 2. Backend validates
 * 3. Backend asks confirmation
 * 4. User confirms
 * 5. Backend writes + logs history
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Groq = require('groq-sdk');

const { createEvent, addRole, updateRole, archiveRole, archiveEvent, findFutureEventsByPhone } = require('./eventOperations_v3');
const { normalizeRoleType } = require('./normalizers');

const groqApiKey = defineSecret('GROQ_API_KEY');
const db = admin.firestore();

const AI_SYSTEM_PROMPT = `
Ești un asistent pentru gestionarea evenimentelor.

REGULI OBLIGATORII:
- Date format: DD-MM-YYYY (ex: 15-01-2026)
- Time format: HH:mm (ex: 14:30)
- NU calcula date relative ("mâine", "vineri") - cere data exactă
- NU șterge niciodată - folosește ARCHIVE
- Evenimentul NU are oră - orele sunt pe roluri

SCHEMA V3 (EN):
- eventShortId: number (1, 2, 3...)
- date: "DD-MM-YYYY"
- address: string
- phoneE164: "+40..." (E.164 format)
- childName, childAge, childDob
- rolesBySlot: { "01A": {...}, "01B": {...} }
- payment: { status: "PAID|UNPAID|CANCELLED", method, amount }

ROLURI DISPONIBILE:
- ANIMATOR: animație petreceri (character poate fi "MC" sau null)
- URSITOARE: pentru botezuri (3 sau 4, întreabă obligatoriu)
- COTTON_CANDY: vată de zahăr
- POPCORN: popcorn
- DECORATIONS: decorațiuni
- BALLOONS: baloane
- HELIUM_BALLOONS: baloane cu heliu
- SANTA_CLAUS: Moș Crăciun
- DRY_ICE: gheață carbonică
- ARCADE: arcadă jocuri

FLOW OBLIGATORIU:
1. Dacă lipsesc date obligatorii → action: "ASK_INFO"
2. Când ai toate datele → action: "PROPOSE" cu rezumat
3. Dacă user confirmă → action: "CONFIRM_WRITE"
4. Dacă user modifică → action: "ASK_INFO" cu ce lipsește

IDENTIFICARE EVENIMENT:
- Dacă user dă eventShortId (număr) → folosește-l
- Dacă user dă telefon → caută evenimente viitoare
- Dacă user dă date+address → verifică duplicate

OUTPUT JSON:
{
  "action": "ASK_INFO|PROPOSE|CONFIRM_WRITE|IDENTIFY_EVENT",
  "eventShortId": number,
  "data": {
    "date": "DD-MM-YYYY",
    "address": "...",
    "phoneE164": "+40...",
    "childName": "...",
    "roles": [...]
  },
  "missingFields": ["field1", "field2"],
  "message": "mesaj către user"
}
`.trim();

/**
 * Main AI handler
 */
exports.aiEventHandler = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '512MiB',
    secrets: [groqApiKey],
  },
  async (request) => {
    const uid = request.auth?.uid;
    const email = request.auth?.token?.email;
    
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { text, conversationId } = request.data;
    
    if (!text) {
      throw new HttpsError('invalid-argument', 'text is required');
    }
    
    try {
      const groqKey = groqApiKey.value();
      const groq = new Groq({ apiKey: groqKey });
      
      // Call LLM
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      });
      
      const aiResponse = completion.choices[0]?.message?.content;
      const parsed = JSON.parse(aiResponse);
      
      // Log AI parse in history
      if (conversationId) {
        await db.collection('conversations').doc(conversationId).collection('history').add({
          type: 'AI_PARSE',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          userMessage: text,
          aiResponse: aiResponse,
          parsedOriginal: parsed,
          parsedCurrent: parsed,
          missingFields: parsed.missingFields || [],
          confidence: parsed.confidence || null,
        });
      }
      
      // Handle action
      const action = parsed.action;
      
      if (action === 'ASK_INFO') {
        return {
          success: true,
          action: 'ASK_INFO',
          message: parsed.message,
          missingFields: parsed.missingFields || [],
        };
      }
      
      if (action === 'PROPOSE') {
        return {
          success: true,
          action: 'PROPOSE',
          message: parsed.message,
          data: parsed.data,
        };
      }
      
      if (action === 'CONFIRM_WRITE') {
        // Execute write
        const userContext = {
          uid,
          email,
          staffCode: null, // TODO: get from staffProfiles
        };
        
        const result = await createEvent(parsed.data, userContext);
        
        return {
          success: true,
          action: 'CREATED',
          eventId: result.id,
          eventShortId: result.eventShortId,
          message: `✅ Eveniment creat! #${result.eventShortId}`,
        };
      }
      
      if (action === 'IDENTIFY_EVENT') {
        // Find event by phone or eventShortId
        let events = [];
        
        if (parsed.eventShortId) {
          const snapshot = await db.collection('evenimente')
            .where('eventShortId', '==', parsed.eventShortId)
            .limit(1)
            .get();
          
          if (!snapshot.empty) {
            events = [{ id: snapshot.docs[0].id, ...snapshot.docs[0].data() }];
          }
        } else if (parsed.data?.phoneE164) {
          events = await findFutureEventsByPhone(parsed.data.phoneE164);
        }
        
        if (events.length === 0) {
          return {
            success: true,
            action: 'NOT_FOUND',
            message: 'Nu am găsit evenimente. Vrei să creez unul nou?',
          };
        }
        
        if (events.length === 1) {
          return {
            success: true,
            action: 'FOUND_ONE',
            event: events[0],
            message: `Am găsit eveniment #${events[0].eventShortId} pe ${events[0].date}. Confirmă pentru a continua.`,
          };
        }
        
        return {
          success: true,
          action: 'FOUND_MULTIPLE',
          events: events.map(e => ({ id: e.id, eventShortId: e.eventShortId, date: e.date, address: e.address })),
          message: `Am găsit ${events.length} evenimente. Care vrei să-l modifici?`,
        };
      }
      
      return {
        success: false,
        message: 'Action necunoscut',
      };
      
    } catch (error) {
      console.error('[aiEventHandler] Error:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);
