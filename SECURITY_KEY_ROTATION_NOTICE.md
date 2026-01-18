# ⚠️ SECURITY NOTICE

**GROQ API Key partially exposed in docs (PR20_RELEASE_AUDIT.md, IMPLEMENTATION_COMPLETE_FINAL.md, etc.)**

## Action Required

1. **Rotate GROQ API key immediately**:
   - Go to: https://console.groq.com/keys
   - Revoke old key: `gsk_0XbrEDBPAHqgKgCs3u2m...` (partially shown in logs)
   - Generate new key
   - Update Firebase Secrets:
     ```bash
     echo "NEW_KEY" | firebase functions:secrets:set GROQ_API_KEY --project superparty-frontend
     ```

2. **Redacted files**:
   - `deploy_with_api.js` (root)
   - `functions/deploy_with_api.js`
   - Docs left as-is (historical reference, partial keys only)

3. **Firebase API keys** (public keys, safe in client apps):
   - `AIzaSyB5zJqeDVenc9ygUx2zyW2WLkczY6FLavI` (superparty-frontend)
   - `AIzaSyDcec3QIIpqrhmGSsvAeH2qEbuDKwZFG3o` (kyc-app)
   - These are **web API keys** and are safe to commit (restricted by Firebase security rules)

## Status
- ✅ Hardcoded keys redacted from executable scripts
- ⚠️ Key rotation recommended (GROQ key was in docs/logs)
- ✅ Firebase API keys are public and restricted (safe)
