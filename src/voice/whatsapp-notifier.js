const twilio = require('twilio');

class WhatsAppNotifier {
  constructor() {
    this.client = null;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Twilio Sandbox
    
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('[WhatsAppNotifier] Initialized with Twilio');
    } else {
      console.warn('[WhatsAppNotifier] Twilio credentials missing');
    }
  }

  /**
   * Send reservation confirmation via WhatsApp
   */
  async sendReservationConfirmation(phoneNumber, reservation) {
    if (!this.client) {
      console.warn('[WhatsAppNotifier] Cannot send - Twilio not configured');
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      // Format phone number for WhatsApp
      const toNumber = this.formatWhatsAppNumber(phoneNumber);
      
      // Build confirmation message
      const message = this.buildConfirmationMessage(reservation);
      
      // Send via Twilio WhatsApp
      const result = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body: message
      });

      console.log('[WhatsAppNotifier] Sent confirmation:', result.sid);
      
      return {
        success: true,
        messageSid: result.sid,
        status: result.status
      };
      
    } catch (error) {
      console.error('[WhatsAppNotifier] Error sending message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build confirmation message text
   */
  buildConfirmationMessage(reservation) {
    const lines = [
      '🎉 *Confirmare Rezervare SuperParty*',
      '',
      `📋 *Cod Rezervare:* ${reservation.reservationId}`,
      '',
      '📅 *Detalii Eveniment:*'
    ];

    if (reservation.date) {
      lines.push(`• Data: ${reservation.date}`);
    }
    
    if (reservation.guests) {
      lines.push(`• Invitați: ${reservation.guests}`);
    }
    
    if (reservation.eventType) {
      lines.push(`• Tip: ${reservation.eventType}`);
    }
    
    if (reservation.preferences) {
      lines.push(`• Preferințe: ${reservation.preferences}`);
    }
    
    if (reservation.clientName) {
      lines.push(`• Client: ${reservation.clientName}`);
    }

    lines.push('');
    lines.push('✅ *Status:* Rezervare înregistrată');
    lines.push('');
    lines.push('📞 Vă vom contacta în curând pentru confirmare și detalii suplimentare.');
    lines.push('');
    lines.push('Pentru întrebări: 0792 864 811');
    lines.push('');
    lines.push('_Mulțumim că ați ales SuperParty!_ 🎈');

    return lines.join('\n');
  }

  /**
   * Format phone number for WhatsApp
   */
  formatWhatsAppNumber(phoneNumber) {
    // Remove any existing whatsapp: prefix
    let cleaned = phoneNumber.replace(/^whatsapp:/, '');
    
    // Remove spaces, dashes, parentheses
    cleaned = cleaned.replace(/[\s\-\(\)]/g, '');
    
    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
      // If it starts with 0, assume Romanian number
      if (cleaned.startsWith('0')) {
        cleaned = '+40' + cleaned.substring(1);
      } else if (!cleaned.startsWith('40')) {
        // If no country code, assume Romanian
        cleaned = '+40' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }
    
    return 'whatsapp:' + cleaned;
  }

  /**
   * Send test message
   */
  async sendTestMessage(phoneNumber) {
    if (!this.client) {
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      const toNumber = this.formatWhatsAppNumber(phoneNumber);
      
      const result = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body: '🎉 Test message from SuperParty Voice AI!\n\nThis confirms WhatsApp notifications are working.'
      });

      return {
        success: true,
        messageSid: result.sid
      };
      
    } catch (error) {
      console.error('[WhatsAppNotifier] Test message failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if WhatsApp is configured
   */
  isConfigured() {
    return this.client !== null;
  }
}

module.exports = WhatsAppNotifier;
