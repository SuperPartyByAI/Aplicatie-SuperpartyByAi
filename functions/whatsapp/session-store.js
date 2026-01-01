// Session Store - Salvează Baileys sessions în Firestore pentru persistență
const firestore = require('../firebase/firestore');
const fs = require('fs');
const path = require('path');

class SessionStore {
  constructor() {
    this.db = null;
  }

  async initialize() {
    if (!firestore.db) {
      await firestore.initialize();
    }
    this.db = firestore.db;
  }

  /**
   * Salvează session în Firestore
   * @param {string} accountId
   * @param {string} sessionPath - Path la .baileys_auth/{accountId}
   * @param {object} account - Account metadata (optional)
   */
  async saveSession(accountId, sessionPath, account = null) {
    try {
      if (!this.db) await this.initialize();

      const credsPath = path.join(sessionPath, 'creds.json');

      if (!fs.existsSync(credsPath)) {
        console.log(`⚠️ [${accountId}] No creds.json found, skipping save`);
        return;
      }

      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

      // Salvează în Firestore cu metadata
      const data = {
        accountId,
        creds: creds,
        metadata: account
          ? {
              name: account.name,
              phone: account.phone,
              status: account.status,
              createdAt: account.createdAt,
            }
          : null,
        updatedAt: new Date().toISOString(),
        savedAt: firestore.admin.firestore.FieldValue.serverTimestamp(),
      };

      await this.db.collection('whatsapp_sessions').doc(accountId).set(data);

      console.log(`💾 [${accountId}] Session saved to Firestore with metadata`);
      return true;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to save session:`, error.message);
      return false;
    }
  }

  /**
   * Restaurează session din Firestore
   * @param {string} accountId
   * @param {string} sessionPath - Path la .baileys_auth/{accountId}
   */
  async restoreSession(accountId, sessionPath) {
    try {
      if (!this.db) await this.initialize();

      const doc = await this.db.collection('whatsapp_sessions').doc(accountId).get();

      if (!doc.exists) {
        console.log(`ℹ️ [${accountId}] No saved session in Firestore`);
        return false;
      }

      const data = doc.data();

      // Creează director dacă nu există
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      // Scrie creds.json
      const credsPath = path.join(sessionPath, 'creds.json');
      fs.writeFileSync(credsPath, JSON.stringify(data.creds, null, 2));

      console.log(`✅ [${accountId}] Session restored from Firestore`);
      return true;
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to restore session:`, error.message);
      return false;
    }
  }

  /**
   * Șterge session din Firestore
   * @param {string} accountId
   */
  async deleteSession(accountId) {
    try {
      if (!this.db) await this.initialize();

      await this.db.collection('whatsapp_sessions').doc(accountId).delete();
      console.log(`🗑️ [${accountId}] Session deleted from Firestore`);
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to delete session:`, error.message);
    }
  }

  /**
   * Listează toate sessions salvate
   */
  async listSessions() {
    try {
      if (!this.db) await this.initialize();

      const snapshot = await this.db.collection('whatsapp_sessions').get();
      const sessions = [];

      snapshot.forEach(doc => {
        sessions.push({
          accountId: doc.id,
          ...doc.data(),
        });
      });

      return sessions;
    } catch (error) {
      console.error('❌ Failed to list sessions:', error.message);
      return [];
    }
  }
}

module.exports = new SessionStore();
