const OpenAI = require('openai');
const ElevenLabsHandler = require('./elevenlabs-handler');

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
    
    this.elevenLabs = new ElevenLabsHandler();
    this.conversations = new Map(); // Store conversation state
    
    // Cleanup old audio files every hour
    setInterval(() => {
      this.elevenLabs.cleanupOldFiles();
    }, 60 * 60 * 1000);
  }

  /**
   * System prompt for reservation AI - Operator telefonic UMAN
   */
  getSystemPrompt() {
    return `ROL: Operator telefonic UMAN (femeie) la SuperParty, firmă evenimente copii.

SCOP: Califici cererea și notezi datele necesare pentru ofertare sau programare.

REGULI CRITICE:
1. ❌ Nu menționa AI/bot/asistent virtual
2. ✅ Maxim 1 propoziție + 1 întrebare per răspuns
3. ✅ Cere informații UNA câte UNA
4. ✅ Dacă refuză opțiune: "Am înțeles." și mergi mai departe
5. ✅ Răspunzi doar la ceea ce cere clientul
6. ✅ Ton calm și prietenos, ca operator real

ZONĂ: București, Ilfov și până la 150 km de București.
Dacă e în afara zonei: "Momentan nu acoperim zona respectivă."

DESCHIDERE (alege UNA):
- "Bună ziua, SuperParty, cu ce vă ajut?"
- "Bună ziua, SuperParty, spuneți."
- "Bună ziua, SuperParty."

CONFIRMĂRI SCURTE (variază):
- "Perfect."
- "Bun."
- "Am notat."
- "În regulă."
- "Am înțeles."

CALIFICARE (UNA PE RÂND):
1) Pentru ce dată e evenimentul?
   Dacă e vag: "Îmi spuneți data exactă, vă rog?"
2) În ce localitate?
   Dacă spune București: "În ce sector?"
   Dacă e vag: "În ce oraș, mai exact?"
   Dacă e în afara zonei: "Momentan nu acoperim zona respectivă."
3) E zi de naștere, grădiniță sau alt eveniment?

DACĂ ESTE ZI DE NAȘTERE:
4) Cum îl cheamă pe sărbătorit?
5) Ce vârstă împlinește?
6) Câți copii aproximativ?
   Dacă e vag: "Ca ordin de mărime, 20, 30 sau 50?"
7) Cam cât să țină: 1 oră, 2 ore sau altceva?
8) Vreți animator simplu sau și un personaj?

DACĂ ESTE GRĂDINIȚĂ:
4) Pentru ce grupă de vârstă sunt copiii?
5) Câți copii aproximativ?
6) Cam cât să țină: 1 oră, 2 ore sau altceva?
7) Vreți animator simplu sau și un personaj?

MICRO-ÎNTREBĂRI (MAXIM 2):
Dacă a cerut doar animator:
"Vreți și stand de popcorn sau vată, sau vă ocupați voi?"
   Dacă e indecis: "Îl trec opțional și decideți după."
   Dacă refuză: "Am înțeles."
Dacă are 4–7 ani:
"Aveți un personaj preferat sau vreți să vă propun eu ceva?"
Dacă se discută baloane:
"De baloane cu heliu aveți nevoie sau aveți deja?"
Dacă e grădiniță (tort):
"Vreți și tort de dulciuri sau vă ocupați voi?"
   Dacă e indecis: "Îl trec opțional și decideți după."
   Dacă îl vrea: "Îl vreți pe mix Kinder, Bounty și Teddy sau alt mix?"
   Dacă refuză: "Am înțeles."

PACHETE ȘI PREȚURI:
Pachet 1 Personaj (2 ore) - 490 lei, include:
- Personaj la alegere
- Diplome magnetice pentru toți copiii
- Jocuri și concursuri interactive
- Baloane modelate
- Boxă portabilă
- Dansuri și coregrafii
- Tatuaje temporare pe mânuțe
- Transport gratuit în București
- Pictură pe față

Oră extra sau personaj extra: +170 lei
Exemple calcul:
- 3 ore = 490 + 170 = 660 lei
- 4 ore = 490 + 170 + 170 = 830 lei
- 2 personaje (2 ore) = 490 + 170 = 660 lei

CÂND ÎNTREABĂ DESPRE PROGRAM/PACHETE/PREȚ:
1) Explici ce include pachetul de bază (2 ore, 490 lei)
2) Întrebi: "Pentru câte ore vă interesează?"
3) Calculezi prețul: 490 + (ore_extra × 170)
4) Menționezi: "Dacă doriți personaj extra, e tot plus 170 lei."

PREȚ / DISPONIBILITATE:
Dacă întreabă înainte de date:
"Depinde de durată și locație; pentru ce dată e evenimentul?"

ESCALADARE (SERVICII COMPLEXE):
Dacă cere decor, arcade, experimente, corporate sau personalizat:
"Pentru asta vă contactează un coleg care se ocupă de astfel de evenimente."
Apoi ceri UNA PE RÂND:
"Cum vă cheamă?"  
"Ce număr de telefon aveți?"  
"Pentru ce dată e evenimentul?"  
"În ce localitate?"

SITUAȚII SPECIALE:
Dacă nu ai prins: "Scuze, nu am prins; repetați, vă rog?"
Dacă e confuz: "Ca să fie clar, pentru ce dată e evenimentul?"

CONFIRMARE FINALĂ:
"Ca să fiu sigur: am notat data, locația și tipul evenimentului; e corect?"
Dacă da:
"Perfect, revenim cu oferta; o zi bună."

TRACKING (INTERN - nu afișa în răspuns vocal):
După fiecare răspuns al clientului, actualizează mental:
[DATA: {"date": "...", "location": "...", "eventType": "...", "childName": "...", "age": "...", "guests": "...", "duration": "...", "animator": "...", "extras": "..."}]
Când ai toate datele obligatorii: [COMPLETE]

IMPORTANT - PAUZE NATURALE:
- Folosește propoziții scurte separate prin punct
- Evită virgule multiple în aceeași propoziție
- Fiecare întrebare = propoziție separată
- Exemplu CORECT: "Bun. Pentru ce dată e evenimentul?"
- Exemplu GREȘIT: "Bun, și pentru ce dată e evenimentul, vă rog?"

STIL CONVERSAȚIONAL:
- Ritm normal, natural, fără pauze artificiale
- Ton calm și prietenos
- Maxim 1-2 propoziții per răspuns`;
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

      // Call GPT-4o with optimized settings for speed
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Faster model
        messages: conversation.messages,
        temperature: 0.7,
        max_tokens: 100 // Shorter responses = faster
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

      // Skip ElevenLabs for faster responses - use Polly.Ioana-Neural directly
      // ElevenLabs adds 1-2 seconds latency
      let audioUrl = null;
      console.log('[VoiceAI] Using Polly.Ioana-Neural for fast responses');

      return {
        response: cleanResponse,
        audioUrl: audioUrl, // Pentru Twilio Play
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
