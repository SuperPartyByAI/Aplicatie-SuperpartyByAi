# Firefox Sessions vs Backend Accounts

## Overview

The WhatsApp integration has **two separate systems**:

1. **Firefox Sessions (Manual)** - Local browser tabs using Firefox Containers
2. **Backend Accounts (AI)** - Managed by Railway backend using Baileys library

These are **completely separate** and do **NOT** sync automatically.

---

## Firefox Sessions (Manual)

### What it is:
- **Local Firefox tabs** opened via `firefox-container` script
- Each session runs in a **Firefox Container** (isolated)
- **Manual operation** - you scan QR codes directly in browser
- Stored **locally** in Firefox (not in backend)

### Use cases:
- Quick testing
- Manual WhatsApp Web access
- Operator convenience (30 tabs)

### Location:
- Script: `scripts/wa_web_launcher/firefox-container`
- Containers: WA-01, WA-02, ... WA-30

### Limitations:
- ❌ Does NOT appear in Flutter app
- ❌ Does NOT enable AI features
- ❌ Does NOT sync with backend
- ❌ Requires manual QR scanning in each tab

---

## Backend Accounts (AI)

### What it is:
- **Managed by Railway backend** (Baileys library)
- Stored in **Firestore** database
- **AI-enabled** - supports operator inbox, automated responses
- QR codes generated **in app** and displayed there

### Use cases:
- AI-powered message handling
- Operator inbox integration
- Automated responses
- Message queuing and delivery

### Location:
- Backend: Railway (`whatsapp-backend`)
- Database: Firestore (`accounts` collection)
- App: Flutter `WhatsAppAccountsScreen`

### How to use:
1. Open Flutter app → WhatsApp Accounts
2. Click "Add Account"
3. Enter name and phone number
4. QR code appears in app
5. Scan with WhatsApp mobile app
6. Account becomes "connected" and ready for AI features

---

## Key Differences

| Aspect | Firefox Sessions | Backend Accounts |
|--------|-----------------|------------------|
| **Location** | Local (Firefox) | Cloud (Railway + Firestore) |
| **AI Features** | ❌ No | ✅ Yes |
| **App Integration** | ❌ No | ✅ Yes |
| **QR Generation** | Browser (web.whatsapp.com) | App (backend) |
| **Sync** | ❌ No | ✅ Yes |
| **Use Case** | Manual testing | Production (AI) |

---

## Why Firefox Sessions Don't Appear in App

**Firefox sessions are local browser tabs**, not backend accounts. The Flutter app only shows accounts from:

```
Flutter App → Cloud Functions Proxy → Railway Backend → Firestore
```

Firefox containers are **completely separate** and never touch the backend.

---

## Backend Mode: Active vs Passive

The backend can run in two modes:

### Active Mode
- ✅ Backend holds lock
- ✅ Baileys connections active
- ✅ AI features available
- ✅ Outbox processing enabled
- ✅ Inbound message handling enabled

### Passive Mode
- ⚠️ Another Railway instance holds lock
- ❌ Baileys connections NOT started
- ❌ AI features disabled
- ❌ Outbox processing disabled
- ⚠️ Accounts visible but not functional

**Why Passive?**
- Multiple Railway deployments running simultaneously
- Lock held by another instance (e.g., staging, old deployment)
- Only one instance can be ACTIVE at a time (prevents conflicts)

**How to Fix:**
1. Check Railway Dashboard for multiple deployments
2. Ensure only **one active deployment** in production
3. Set Railway `numReplicas: 1` in `railway.json`
4. Redeploy single instance

---

## How to Check Backend Mode

### In App:
- Open Flutter app → WhatsApp Accounts
- Check **diagnostics banner** at top:
  - 🟢 **Backend ACTIVE** → Ready for AI features
  - 🟠 **Backend PASSIVE** → Lock held by another instance

### Via API:
```bash
curl -s https://whats-upp-production.up.railway.app/ready | jq
```

**Response (Active):**
```json
{
  "ready": true,
  "mode": "active",
  "instanceId": "..."
}
```

**Response (Passive):**
```json
{
  "ready": false,
  "mode": "passive",
  "reason": "lock_not_acquired",
  "instanceId": "..."
}
```

---

## FAQ

### Q: Why don't my Firefox tabs appear in the app?
**A:** Firefox sessions are local browser tabs, not backend accounts. They don't sync with the backend.

### Q: Can I use both Firefox and Backend accounts?
**A:** Yes, they're separate systems. Firefox for manual testing, Backend for AI features.

### Q: How do I enable AI features?
**A:** Use Backend Accounts (add via Flutter app), not Firefox sessions.

### Q: Backend is PASSIVE, what do I do?
**A:** Check Railway Dashboard for multiple deployments. Ensure only one active instance.

### Q: Can I sync Firefox sessions with Backend?
**A:** Not automatically. Firefox sessions are local browser tabs. Use Backend Accounts for cloud-synced AI features.

---

## Summary

- **Firefox Sessions** = Manual, local, no AI
- **Backend Accounts** = Managed, cloud, AI-enabled
- **They are separate** - don't expect Firefox tabs to appear in app
- **Use Backend Accounts** for production AI features
- **Use Firefox Sessions** for quick manual testing

---

**For production, always use Backend Accounts (Baileys) via Flutter app, not Firefox sessions.**
