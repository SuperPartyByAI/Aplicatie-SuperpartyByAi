# Secrets Inventory

**IMPORTANT:** This file contains ONLY variable names and metadata. NO actual values.

## Hetzner Services

### whatsapp-backend (Production)

**Service:** `https://whats-app-ompro.ro`  
**Environment:** Production  
**Host:** Hetzner VPS (37.27.34.179)

| Variable Name                   | Stored In         | Used By                    | Owner                  | Rotation Period |
| ------------------------------- | ----------------- | -------------------------- | ---------------------- | --------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | systemd Environment | whatsapp-backend           | Firebase Project Owner | 90 days         |
| `ADMIN_TOKEN`                   | systemd Environment | whatsapp-backend           | Project Owner          | 60 days         |
| `OPENAI_API_KEY`                | systemd Environment | whatsapp-backend (if used) | OpenAI Account Owner   | 90 days         |
| `TWILIO_ACCOUNT_SID`            | systemd Environment | whatsapp-backend (if used) | Twilio Account Owner   | N/A             |
| `TWILIO_AUTH_TOKEN`             | systemd Environment | whatsapp-backend (if used) | Twilio Account Owner   | 90 days         |

### voice-backend (Production)

**Service:** TBD  
**Environment:** Production

| Variable Name         | Stored In         | Used By                  | Owner                    | Rotation Period |
| --------------------- | ----------------- | ------------------------ | ------------------------ | --------------- |
| `OPENAI_API_KEY`      | systemd Environment | voice-backend            | OpenAI Account Owner     | 90 days         |
| `ELEVENLABS_API_KEY`  | systemd Environment | voice-backend            | ElevenLabs Account Owner | 90 days         |
| `ELEVENLABS_VOICE_ID` | systemd Environment | voice-backend            | ElevenLabs Account Owner | N/A             |
| `TWILIO_ACCOUNT_SID`  | systemd Environment | voice-backend            | Twilio Account Owner     | N/A             |
| `TWILIO_AUTH_TOKEN`   | Hetzner Variables | voice-backend            | Twilio Account Owner     | 90 days         |
| `TWILIO_PHONE_NUMBER` | Hetzner Variables | voice-backend            | Twilio Account Owner     | N/A             |
| `COQUI_API_KEY`       | Hetzner Variables | voice-backend (fallback) | Coqui Account Owner      | 90 days         |

## Firebase/GCP

**Project ID:** `superparty-frontend`  
**Project Number:** TBD

### Firestore Collections

- `whatsapp_accounts` - WhatsApp account metadata
- `whatsapp_sessions` - Baileys auth state backup
- `whatsapp_messages` - Message history
- `whatsapp_threads` - Chat threads

### Authentication

**Hetzner → Firebase:**

- Method: Service Account JSON
- Variable: `FIREBASE_SERVICE_ACCOUNT_JSON` (Hetzner Variables)
- Service Account Email: `firebase-adminsdk-*@superparty-frontend.iam.gserviceaccount.com`
- Roles Required:
  - Firestore Data Editor
  - Firestore Data Viewer

## Firebase Functions

**Function:** `whatsappV4` (v2 function)  
**Runtime:** Node.js 20

| Variable Name         | Stored In       | Used By    | Owner                | Rotation Period |
| --------------------- | --------------- | ---------- | -------------------- | --------------- |
| `OPENAI_API_KEY`      | Firebase Config | whatsappV4 | OpenAI Account Owner | 90 days         |
| `TWILIO_ACCOUNT_SID`  | Firebase Config | whatsappV4 | Twilio Account Owner | N/A             |
| `TWILIO_AUTH_TOKEN`   | Firebase Config | whatsappV4 | Twilio Account Owner | 90 days         |
| `TWILIO_PHONE_NUMBER` | Firebase Config | whatsappV4 | Twilio Account Owner | N/A             |

## Third-Party Service Ownership

| Service      | Owner/Admin | Account Email | Notes                |
| ------------ | ----------- | ------------- | -------------------- |
| Hetzner      | TBD         | TBD           | Hosting platform     |
| Firebase/GCP | TBD         | TBD           | Database & Functions |
| Twilio       | TBD         | TBD           | Voice & SMS          |
| OpenAI       | TBD         | TBD           | GPT-4o API           |
| ElevenLabs   | TBD         | TBD           | Voice synthesis      |
| Coqui        | TBD         | TBD           | Fallback TTS         |

## WhatsApp Session Persistence

**Implementation:** Hybrid (Disk + Firestore backup)

### Hetzner (whatsapp-backend)

- **Auth State:** Filesystem (useMultiFileAuthState)
- **Sessions Path:** `/app/.baileys_auth` (ephemeral - needs Volume)
- **Volume:** ❌ NOT CONFIGURED (P1 priority)
- **Recommended:** Mount Hetzner Volume at `/data/.baileys_auth`
- **ENV Variable:** `SESSIONS_PATH` (to be added)

### Firebase Functions (whatsappV4)

- **Auth State:** Filesystem + Firestore backup
- **Sessions Path:** `/tmp/.baileys_auth/<accountId>/` (ephemeral)
- **Firestore Backup:** `whatsapp_sessions/<accountId>` (multi-file auth state)
- **Restore Flow:** Firestore → disk → Baileys

## Security Notes

1. **Never commit secrets to repository**
2. **Use Hetzner Variables / Firebase Config for all secrets**
3. **Rotate credentials every 60-90 days**
4. **Service accounts should have minimal required permissions**
5. **Monitor for unauthorized access in GCP IAM logs**

## Rotation Checklist

When rotating credentials:

1. Generate new credential in service provider
2. Update Hetzner Variables / Firebase Config
3. Wait for deployment to complete
4. Verify service health
5. Revoke old credential
6. Update this inventory with rotation date

## Last Updated

- **Date:** 2025-12-31
- **By:** Ona (AI Agent)
- **Reason:** P0 fix - Hetzner crash loop due to invalid Firebase credentials
