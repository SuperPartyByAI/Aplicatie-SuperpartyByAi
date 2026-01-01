/**
 * FIRESTORE AUTH STATE FOR BAILEYS
 *
 * Persists Baileys auth state (creds + keys) in Firestore instead of filesystem.
 *
 * Structure:
 * - wa_metrics/longrun/baileys_auth/creds -> { creds: {...} }
 * - wa_metrics/longrun/baileys_auth/keys/{type}/{id} -> { data: {...} }
 */

const { FieldValue } = require('firebase-admin/firestore');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

class FirestoreAuthState {
  constructor(db) {
    this.db = db;
    this.basePath = 'wa_metrics/longrun/baileys_auth';
    this.lastAuthWriteAt = null;

    console.log('[FirestoreAuth] Initialized');
  }

  /**
   * Load auth state from Firestore
   */
  async loadAuthState() {
    try {
      console.log('[FirestoreAuth] Loading auth state from Firestore...');

      // Load creds
      const credsDoc = await this.db.doc(`${this.basePath}/creds`).get();
      let creds;

      if (credsDoc.exists) {
        creds = credsDoc.data().creds;
        console.log('[FirestoreAuth] ✅ Loaded existing creds');
      } else {
        creds = initAuthCreds();
        console.log('[FirestoreAuth] ⚠️ No existing creds, initialized new');
      }

      // Load keys
      const keysSnapshot = await this.db.collection(`${this.basePath}/keys`).get();
      const keys = {};

      keysSnapshot.forEach(doc => {
        const parts = doc.id.split('_');
        const type = parts[0];
        const id = parts.slice(1).join('_');

        if (!keys[type]) {
          keys[type] = {};
        }
        keys[type][id] = doc.data().data;
      });

      console.log(`[FirestoreAuth] ✅ Loaded ${keysSnapshot.size} keys`);

      return { creds, keys };
    } catch (error) {
      console.error('[FirestoreAuth] Error loading auth state:', error);
      // Return fresh creds on error
      return {
        creds: initAuthCreds(),
        keys: {},
      };
    }
  }

  /**
   * Create auth state handler for Baileys
   */
  async useFirestoreAuthState() {
    const { creds, keys } = await this.loadAuthState();

    const saveState = async () => {
      try {
        // Save creds
        await this.db.doc(`${this.basePath}/creds`).set({
          creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Save keys
        const batch = this.db.batch();
        let keyCount = 0;

        for (const [type, typeKeys] of Object.entries(keys)) {
          for (const [id, data] of Object.entries(typeKeys)) {
            const docId = `${type}_${id}`;
            const ref = this.db.doc(`${this.basePath}/keys/${docId}`);
            batch.set(ref, {
              data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
              updatedAt: FieldValue.serverTimestamp(),
            });
            keyCount++;
          }
        }

        if (keyCount > 0) {
          await batch.commit();
        }

        this.lastAuthWriteAt = new Date().toISOString();
        console.log(`[FirestoreAuth] ✅ Saved auth state (${keyCount} keys)`);
      } catch (error) {
        console.error('[FirestoreAuth] Error saving auth state:', error);
      }
    };

    return {
      state: {
        creds,
        keys,
      },
      saveCreds: async () => {
        await saveState();
      },
      saveKeys: async () => {
        await saveState();
      },
    };
  }

  /**
   * Get last auth write timestamp
   */
  getLastAuthWriteAt() {
    return this.lastAuthWriteAt;
  }

  /**
   * Clear auth state (for logout)
   */
  async clearAuthState() {
    try {
      console.log('[FirestoreAuth] Clearing auth state...');

      // Delete creds
      await this.db.doc(`${this.basePath}/creds`).delete();

      // Delete all keys
      const keysSnapshot = await this.db.collection(`${this.basePath}/keys`).get();
      const batch = this.db.batch();

      keysSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (!keysSnapshot.empty) {
        await batch.commit();
      }

      this.lastAuthWriteAt = null;
      console.log('[FirestoreAuth] ✅ Cleared auth state');
    } catch (error) {
      console.error('[FirestoreAuth] Error clearing auth state:', error);
    }
  }

  /**
   * Check if auth state exists
   */
  async hasAuthState() {
    try {
      const credsDoc = await this.db.doc(`${this.basePath}/creds`).get();
      return credsDoc.exists;
    } catch (error) {
      console.error('[FirestoreAuth] Error checking auth state:', error);
      return false;
    }
  }

  /**
   * Get auth state info
   */
  async getAuthStateInfo() {
    try {
      const credsDoc = await this.db.doc(`${this.basePath}/creds`).get();
      const keysSnapshot = await this.db.collection(`${this.basePath}/keys`).get();

      return {
        hasAuth: credsDoc.exists,
        credsUpdatedAt: credsDoc.exists ? credsDoc.data().updatedAt : null,
        keyCount: keysSnapshot.size,
        lastAuthWriteAt: this.lastAuthWriteAt,
      };
    } catch (error) {
      console.error('[FirestoreAuth] Error getting auth state info:', error);
      return {
        hasAuth: false,
        error: error.message,
      };
    }
  }
}

module.exports = FirestoreAuthState;
