const OpenAI = require('openai');

class VoiceAIHandler {
  constructor() {
    this.openai = null;
    
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      console.log('[VoiceAI] Initialized with OpenAI');
    } else {
      console.warn('[VoiceAI] OpenAI API key missing - Voice AI disabled');
    }
    
    this.conversations = new Map(); // Store conversation state
  }

  /**
   * System prompt for reservation AI - Operator telefonic UMAN
   */
  getSystemPrompt() {
    return `ROL: Operator telefonic UMAN la SuperParty, firmă evenimente copii.

SERVICII:
- Principal: animatori petreceri copii
- Extra: mascote, baloane heliu, stand vată/popcorn, tort dulciuri (grădinițe)
- Complex: decor, arcade, experimente, corporate (ESCALADARE la coleg)

ZONĂ: București, Ilfov, max 150km. Altfel: "Nu acoperim zona respectivă."

REGULI CRITICE:
1. ❌ Nu menționa AI/bot/asistent virtual
2. ✅ Maxim 1 propoziție + 1 întrebare per răspuns
3. ✅ Întreabă în loc să explici
4. ✅ Cere informații UNA câte UNA
5. ✅ Dacă refuză opțiune: "Am înțeles." și mergi mai departe
6. ✅ Ton natural, calm, prietenos - ca operator real call-center

STIL: Română simplă. Ton "aflu ce vreți", nu "vând".

CALIFICARE (UNA PE RÂND):
1. "Pentru ce dată e evenimentul?" → Validează: zi/lună/an exact
2. "În ce localitate?" → Dacă București: "Ce sector?"
3. "E zi de naștere, grădiniță sau alt eveniment?"

DACĂ ZI DE NAȘTERE:
4. "Cum îl cheamă pe sărbătorit?"
5. "Ce vârstă împlinește?"
6. "Câți copii aproximativ?" → Dacă vag: "20, 30, 50?"
7. "Câtă durată: 1 oră, 2 ore?"
8. "Vreți animator simplu sau și mascotă/personaj?"

DACĂ GRĂDINIȚĂ:
4. "Pentru ce grupă de vârstă?"
5. "Câți copii aproximativ?"
6. "Câtă durată: 1 oră, 2 ore?"
7. "Vreți animator simplu sau și mascotă/personaj?"

RECOMANDĂRI (MAX 2, DOAR DACĂ RELEVANT):
- Animator fără gustări: "Vreți și stand popcorn sau vată?"
- Copil 4-7 ani: "Aveți personaj preferat?"
- Grădiniță: "Vreți tort de dulciuri?"
→ Indecis: "Îl trec opțional, decideți după."

VALIDARE:
- Dată vagă ("mâine"): "Ce dată exactă: 15 ianuarie?"
- Locație vagă: "În ce oraș exact?"
- Număr vag ("mulți"): "Aproximativ: 20, 30, 50?"

SITUAȚII SPECIALE:
- Nu înțelegi: "Scuze, nu am prins. Puteți repeta?"
- Schimbă subiectul: Notează, răspunde scurt, revii la calificare
- E confuz: "Să recapitulăm: pentru ce dată e?"

CONFIRMARE FINALĂ:
"Deci am notat: [dată], [locație], [tip], [detalii]. Corect?"
→ Dacă DA: "Perfect. Vă contactăm cu oferta. O zi bună."

TRACKING (INTERN):
[DATA: {"date": "...", "location": "...", "eventType": "...", "childName": "...", "age": "...", "guests": "...", "duration": "...", "animator": "...", "extras": "..."}]
Când ai toate datele necesare: [COMPLETE]

PREȚ: Dacă întreabă înainte de date: "Depinde de durată și locație. Pentru ce dată e?"

SERVICII COMPLEXE: "Pentru asta vă contactează un coleg specializat." → cere nume, telefon, dată, localitate.`;
  }

  /**
   * Process conversation turn with GPT-4o
   */
  async processConversation(callSid, userMessage) {
    if (!this.openai) {
      return {
        response: 'Ne pare rău, serviciul Voice AI nu este disponibil momentan.',
        completed: true,
        data: null
      };
    }
    
    try {
      // Get or create conversation history
      let conversation = this.conversations.get(callSid);
      
      if (!conversation) {
        conversation = {
          messages: [
            { role: 'system', content: this.getSystemPrompt() },
            { role: 'assistant', content: 'Bună ziua! Pentru ce dată doriți rezervarea?' }
          ],
          data: {}
        };
        this.conversations.set(callSid, conversation);
      }

      // Add user message
      conversation.messages.push({
        role: 'user',
        content: userMessage
      });

      // Call GPT-4o
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: conversation.messages,
        temperature: 0.7,
        max_tokens: 150
      });

      const assistantMessage = response.choices[0].message.content;

      // Add assistant response to history
      conversation.messages.push({
        role: 'assistant',
        content: assistantMessage
      });

      // Check if conversation is complete
      let completed = false;
      let reservationData = null;

      // Extract data from [DATA: {...}] marker
      const dataMatch = assistantMessage.match(/\[DATA:\s*({[^}]+})\]/);
      if (dataMatch) {
        try {
          const extractedData = JSON.parse(dataMatch[1]);
          conversation.data = { ...conversation.data, ...extractedData };
        } catch (e) {
          console.error('[VoiceAI] Failed to parse data:', e);
        }
      }

      // Check for completion marker
      if (assistantMessage.includes('[COMPLETE]') || assistantMessage.includes('WhatsApp')) {
        completed = true;
        reservationData = conversation.data;
      }

      // Clean response (remove markers)
      const cleanResponse = assistantMessage
        .replace(/\[DATA:.*?\]/g, '')
        .replace(/\[COMPLETE\]/g, '')
        .trim();

      return {
        response: cleanResponse,
        completed,
        data: reservationData
      };

    } catch (error) {
      console.error('[VoiceAI] Error processing conversation:', error);
      return {
        response: 'Ne pare rău, am întâmpinat o problemă tehnică. Vă rugăm să sunați din nou.',
        completed: true,
        data: null
      };
    }
  }

  /**
   * Get full conversation transcript
   */
  getConversationTranscript(callSid) {
    const conversation = this.conversations.get(callSid);
    if (!conversation) return null;

    return conversation.messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'Client' : 'AI'}: ${m.content}`)
      .join('\n');
  }

  /**
   * Clean up conversation after call ends
   */
  endConversation(callSid) {
    const conversation = this.conversations.get(callSid);
    this.conversations.delete(callSid);
    return conversation;
  }

  /**
   * Get conversation state
   */
  getConversation(callSid) {
    return this.conversations.get(callSid);
  }
}

module.exports = VoiceAIHandler;
