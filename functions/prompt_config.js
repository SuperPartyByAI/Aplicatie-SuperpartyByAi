'use strict';

const admin = require('firebase-admin');

function _db() {
  return admin.apps.length ? admin.firestore() : null;
}

const CACHE_TTL_MS = 60 * 1000;
const AI_PROMPTS_PATH = 'app_config/ai_prompts';

let cache = { data: null, fetchedAt: 0 };

const DEFAULTS = {
  whatsappExtractEvent_system: `Analizează conversația WhatsApp și extrage structurat datele pentru o petrecere/eveniment.
      
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
}`,
  whatsappExtractEvent_userTemplate: `Conversație WhatsApp:
{{conversation_text}}

Client phone: {{phone_e164}}

Extrage date pentru petrecere (dacă există). Răspunde JSON strict.`,
  clientCrmAsk_system: `Ești un asistent CRM care răspunde la întrebări despre clienți bazat pe date structurate (evenimente, cheltuieli).

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
}`,
  clientCrmAsk_userTemplate: `Client: {{client_json}}
Evenimente: {{events_json}}

Întrebare: {{question}}

Răspunde bazat pe datele furnizate. Răspunde JSON strict.`,
};

function applyTemplate(template, vars) {
  if (!template || typeof template !== 'string') return template || '';
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const placeholder = `{{${k}}}`;
    const safe = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    out = out.split(placeholder).join(safe);
  }
  return out;
}

/**
 * Load app_config/ai_prompts from Firestore with 60s in-memory cache.
 * Returns safe defaults if missing/invalid. Logs version only (never full prompt).
 */
async function getPromptConfig() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const merged = { ...DEFAULTS };
  const db = _db();

  if (!db) {
    console.warn('[prompt_config] Firestore not available, using defaults');
    return merged;
  }

  try {
    const ref = db.doc(AI_PROMPTS_PATH);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log('[prompt_config] app_config/ai_prompts missing, using defaults');
      cache = { data: merged, fetchedAt: now };
      return merged;
    }

    const data = snap.data();
    const version = data.version ?? 0;
    console.log('[prompt_config] using app_config/ai_prompts version=' + version);

    if (data.whatsappExtractEvent_system !== undefined && data.whatsappExtractEvent_system !== null)
      merged.whatsappExtractEvent_system = String(data.whatsappExtractEvent_system);
    if (
      data.whatsappExtractEvent_userTemplate !== undefined &&
      data.whatsappExtractEvent_userTemplate !== null
    )
      merged.whatsappExtractEvent_userTemplate = String(data.whatsappExtractEvent_userTemplate);
    if (data.clientCrmAsk_system !== undefined && data.clientCrmAsk_system !== null)
      merged.clientCrmAsk_system = String(data.clientCrmAsk_system);
    if (data.clientCrmAsk_userTemplate !== undefined && data.clientCrmAsk_userTemplate !== null)
      merged.clientCrmAsk_userTemplate = String(data.clientCrmAsk_userTemplate);

    cache = { data: merged, fetchedAt: now };
    return merged;
  } catch (e) {
    console.warn('[prompt_config] load failed, using defaults:', e.message);
    cache = { data: merged, fetchedAt: now };
    return merged;
  }
}

function invalidateCache() {
  cache = { data: null, fetchedAt: 0 };
}

module.exports = {
  getPromptConfig,
  applyTemplate,
  invalidateCache,
  DEFAULTS,
};
