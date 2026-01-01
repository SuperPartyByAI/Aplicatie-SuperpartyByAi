require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Railway proxy for rate limiting
app.set('trust proxy', 1);

// Twilio credentials from env vars
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// Validate required env vars
if (!accountSid || !authToken || !twilioPhone) {
  console.error(
    '❌ Missing Twilio credentials. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER'
  );
  process.exit(1);
}

const client = twilio(accountSid, authToken);

app.use(express.json());

// Global rate limiting: 100 requests per IP per minute
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many requests. Limit: 100 per minute per IP.',
  },
});

app.use(globalLimiter);

// Rate limiting: 10 SMS per IP per minute
const smsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    success: false,
    error: 'Too many SMS requests. Limit: 10 per minute per IP.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for bulk: 3 requests per IP per minute
const bulkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: 'Too many bulk SMS requests. Limit: 3 per minute per IP.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Twilio SMS Backend',
    uptime: process.uptime(),
    twilioConfigured: !!(accountSid && authToken && twilioPhone),
  });
});

// Send SMS endpoint
app.post('/sms/send', smsLimiter, async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: to, message',
    });
  }

  try {
    const result = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: to,
    });

    res.json({
      success: true,
      messageSid: result.sid,
      status: result.status,
      to: result.to,
      from: result.from,
    });
  } catch (error) {
    console.error('Twilio error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
    });
  }
});

// Bulk SMS endpoint
app.post('/sms/send-bulk', bulkLimiter, async (req, res) => {
  const { recipients, message } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid recipients array',
    });
  }

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'Missing message field',
    });
  }

  const results = [];
  const errors = [];

  for (const recipient of recipients) {
    try {
      const result = await client.messages.create({
        body: message,
        from: twilioPhone,
        to: recipient,
      });

      results.push({
        to: recipient,
        success: true,
        messageSid: result.sid,
        status: result.status,
      });
    } catch (error) {
      errors.push({
        to: recipient,
        success: false,
        error: error.message,
        code: error.code,
      });
    }
  }

  res.json({
    success: errors.length === 0,
    sent: results.length,
    failed: errors.length,
    results,
    errors,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Twilio SMS Backend running on port ${PORT}`);
  console.log(`📱 Twilio phone: ${twilioPhone}`);
});
