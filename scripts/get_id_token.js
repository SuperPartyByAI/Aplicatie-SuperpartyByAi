#!/usr/bin/env node
/**
 * Obține Firebase ID token pentru un user (email/parolă).
 * Folosește token-ul la curl: Authorization: Bearer <token>
 *
 * Usage:
 *   FIREBASE_AUTH_EMAIL=user@example.com FIREBASE_AUTH_PASSWORD=parola node scripts/get_id_token.js
 *
 * Apoi copiezi output-ul și îl pui în scripts/smoke_send_curl.sh la TOKEN="..."
 */

const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0';
const email = process.env.FIREBASE_AUTH_EMAIL;
const password = process.env.FIREBASE_AUTH_PASSWORD;

async function main() {
  if (!email || !password) {
    console.error('Setează FIREBASE_AUTH_EMAIL și FIREBASE_AUTH_PASSWORD.');
    console.error('Exemplu: FIREBASE_AUTH_EMAIL=user@example.com FIREBASE_AUTH_PASSWORD=xxx node scripts/get_id_token.js');
    process.exit(1);
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (data.error) {
    console.error('Auth error:', data.error.message || JSON.stringify(data.error));
    process.exit(1);
  }
  console.log(data.idToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
