const OpenAI = require('openai');

class VoiceAIHandler {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.conversations = new Map(); // Store conversation state
  }

  /**
   * System prompt for reservation AI
   */
  getSystemPrompt() {
    return `Ești asistentul virtual al SuperParty, o companie de organizare evenimente pentru copii.

ROLUL TĂU:
- Colectezi informații pentru rezervări de evenimente
- Ești prietenos, profesionist și eficient
- Vorbești DOAR în română
- Răspunsuri SCURTE și CLARE (max 2 propoziții)

ÎNTREBĂRI DE PUS (în ordine):
1. Data evenimentului (ex: "Pentru ce dată doriți rezervarea?")
2. Număr persoane (ex: "Câți invitați veți avea?")
3. Tip eveniment (ex: "Ce tip de eveniment: botez, nuntă, sau aniversare?")
4. Preferințe animator (ex: "Aveți preferințe pentru animator? Baloane, facepainting, magie?")
5. Nume client (ex: "Cu cine vorbesc?")

REGULI:
- Pune câte o întrebare pe rând
- Dacă clientul dă mai multe informații deodată, confirmă-le și treci la următoarea întrebare
- Dacă clientul e confuz, reformulează întrebarea mai simplu
- La final, confirmă toate informațiile și spune "Vă trimit confirmarea pe WhatsApp. La revedere!"
- NU inventa informații
- NU pune întrebări despre buget sau preț

TRACKING:
Ține evidența informațiilor colectate în fiecare răspuns folosind format JSON la final:
[DATA: {"date": "...", "guests": "...", "eventType": "...", "preferences": "...", "clientName": "..."}]

Când ai toate cele 5 informații, adaugă [COMPLETE] la final.`;
  }

  /**
   * Process conversation turn with GPT-4o
   */
  async processConversation(callSid, userMessage) {
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
