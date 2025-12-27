# Railway Auto-Monitor

Monitors all Railway services 24/7 and automatically repairs issues.

## Features

- ✅ Health checks every 60 seconds
- ✅ Auto-detects errors in logs
- ✅ Auto-restart failed services
- ✅ Notifications for critical issues
- ✅ Zero manual intervention

## Monitored Services

- Backend Principal (web-production-f0714)
- Coqui Voice Service (web-production-00dca9)

## Environment Variables

- `RAILWAY_TOKEN` - Railway API token (required)

## How it works

1. Checks service health every 60 seconds
2. If service is down, attempts auto-restart
3. Monitors logs for error patterns
4. Reports critical issues

## Deploy

This service runs on Railway and monitors other services automatically.
