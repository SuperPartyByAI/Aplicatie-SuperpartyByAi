# Firebase Functions Deployment Instructions

## Prerequisites
1. Firebase CLI installed and authenticated
2. Access to Firebase project: `superparty-frontend`

## Deploy Steps

### 1. Set the OpenAI API Key Secret

Before deploying functions, you MUST set the secret:

```bash
cd kyc-app
firebase functions:secrets:set OPENAI_API_KEY
```

When prompted, paste the OpenAI API key.

### 2. Deploy Functions

```bash
firebase deploy --only functions
```

### 3. Verify Deployment

After deployment, test the function:
- Open the app
- Use the AI chat feature
- Verify responses are generated without errors

## Local Development

For local testing with emulators:

1. Create `functions/.env.local` (DO NOT COMMIT):
```
OPENAI_API_KEY=your-key-here
```

2. Start emulators:
```bash
firebase emulators:start
```

3. Update `src/firebase.js` to use emulator endpoints during development.

## Security Notes

- The API key is stored as a Firebase Functions secret (Google Cloud Secret Manager)
- The key is NEVER exposed to the client
- All AI requests go through the Cloud Function
- Authentication is required to call the function
- Rate limiting is enforced at the function level

## Troubleshooting

If the function fails:
1. Check logs: `firebase functions:log`
2. Verify secret is set: `firebase functions:secrets:access OPENAI_API_KEY`
3. Check function deployment status in Firebase Console
