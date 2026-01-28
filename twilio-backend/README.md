# Twilio SMS Backend

SMS service using Twilio API for SuperParty notifications.

## Setup

1. Get Twilio credentials from [console.twilio.com](https://console.twilio.com)
2. Set environment variables in legacy hosting:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`

## Endpoints

### Health Check

```bash
GET /health
```

### Send Single SMS

```bash
POST /sms/send
Content-Type: application/json

{
  "to": "+40712345678",
  "message": "Your party invitation code: ABC123"
}
```

### Send Bulk SMS

```bash
POST /sms/send-bulk
Content-Type: application/json

{
  "recipients": ["+40712345678", "+40798765432"],
  "message": "Party starts at 8 PM!"
}
```

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your Twilio credentials
npm run dev
```

## legacy hosting Deployment

Set Root Directory to `/twilio-backend` in legacy hosting project settings.
