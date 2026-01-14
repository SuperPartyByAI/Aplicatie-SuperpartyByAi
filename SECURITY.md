# Security policy (repo)

## Never commit secrets

Do **not** commit any of the following into this repository:
- Firebase service account JSONs (`firebase-adminsdk*.json`, `serviceAccount*.json`)
- Private keys / certificates (anything containing `BEGIN PRIVATE KEY`)
- API keys (Groq, Twilio, etc.)
- `.env` files

## How secrets must be provided

- **Firebase Cloud Functions**: use **Secret Manager** (`defineSecret(...)`) or runtime env vars.
- **Local development**: use `.env.local` (ignored by git) or per-developer secret stores.
- **CI/CD**: use GitHub Actions secrets.

## Preventing regressions

This repo runs a CI secret scanner on every PR. Any detected secret should be treated as compromised:
- revoke/rotate immediately
- remove from repo
- invalidate any dependent credentials/tokens

