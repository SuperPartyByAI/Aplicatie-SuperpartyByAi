# Uptime Monitoring - Better Stack

## Critical Endpoints to Monitor

### 1. WhatsApp Backend (legacy hosting)

- **URL**: `https://whats-app-ompro.ro/health`
- **Method**: GET
- **Expected**: 200 OK
- **Check Interval**: 30 seconds
- **Alert**: Email/Slack when down

### 2. Firebase Functions - WhatsApp V4

- **URL**: `https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV4/health`
- **Method**: GET
- **Expected**: 200 OK
- **Check Interval**: 60 seconds
- **Alert**: Email/Slack when down

### 3. Frontend (Firebase Hosting)

- **URL**: `https://superparty-frontend.web.app`
- **Method**: GET
- **Expected**: 200 OK
- **Check Interval**: 60 seconds
- **Alert**: Email/Slack when down

### 4. legacy hosting v7 Monitor

- **URL**: `https://whats-app-ompro.ro/health`
- **Method**: GET
- **Expected**: 200 OK
- **Check Interval**: 30 seconds
- **Alert**: Email/Slack when down

## Setup Instructions

1. Go to Better Stack Dashboard: https://betterstack.com/
2. Navigate to **Uptime** → **Monitors**
3. Click **Create Monitor**
4. For each endpoint above:
   - Name: Service name (e.g., "WhatsApp Backend")
   - URL: Copy from above
   - Check interval: As specified
   - Alert policy: Create/select policy
   - Regions: Select multiple (US, EU)
5. Save and test

## Alert Channels

Configure in **Settings** → **Integrations**:

- Email: your-email@example.com
- Slack: #alerts channel
- Discord: #monitoring channel
- PagerDuty: For critical services

## Status Page

Create public status page:

1. Go to **Status Pages**
2. Create new page
3. Add all monitors
4. Customize branding
5. Share URL: `https://status.superparty.com` (or Better Stack subdomain)
