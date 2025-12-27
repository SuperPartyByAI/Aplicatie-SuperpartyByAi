# SuperParty Application

## Structură Proiect

```
/
├── coqui/              - Voice service (Python)
├── monitoring/         - Auto-repair monitoring (Node.js)
├── kyc-app/           - Frontend application
└── docs/              - Documentație
```

## Deployment Railway

### Service 1: Coqui Voice
- **Root Directory:** `coqui`
- **Build:** Automat (Dockerfile)

### Service 2: Monitoring
- **Root Directory:** `monitoring`
- **Start Command:** `node multi-project-monitor.js`

### Service 3: KYC App
- **Root Directory:** `kyc-app`
- **Build:** Automat

## Documentație

- `PERFECT-FINAL.md` - Monitoring PERFECT
- `ULTIMATE-SYSTEM-FINAL.md` - Monitoring ULTIMATE
- `MULTI-PROJECT-SETUP.md` - Setup multi-project
