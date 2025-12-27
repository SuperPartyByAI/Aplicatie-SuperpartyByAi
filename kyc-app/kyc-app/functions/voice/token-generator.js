const twilio = require('twilio');

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

class TokenGenerator {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.apiKey = process.env.TWILIO_API_KEY;
    this.apiSecret = process.env.TWILIO_API_SECRET;
    this.appSid = process.env.TWILIO_TWIML_APP_SID;
  }

  /**
   * Generate Twilio Access Token for Voice Client
   */
  generateToken(identity) {
    // Create an access token
    const token = new AccessToken(
      this.accountSid,
      this.apiKey,
      this.apiSecret,
      { identity: identity }
    );

    // Create a Voice grant
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: this.appSid,
      incomingAllow: true
    });

    // Add grant to token
    token.addGrant(voiceGrant);

    // Serialize the token to a JWT string
    return token.toJwt();
  }

  /**
   * Validate token configuration
   */
  isConfigured() {
    return !!(
      this.accountSid &&
      this.apiKey &&
      this.apiSecret &&
      this.appSid
    );
  }
}

module.exports = TokenGenerator;
