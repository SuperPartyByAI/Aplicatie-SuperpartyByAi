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
      // CRITICAL FIX: keys is stored as a document, not a collection
      // wa_metrics/longrun/baileys_auth/keys is a document (4 components - even = document)
      // We need to read it as a document, not a collection
      let keys = {};
      try {
        const keysDoc = await this.db.doc(`${this.basePath}/keys`).get();
        
        if (keysDoc.exists) {
          const keysData = keysDoc.data();
          if (keysData && keysData.keys) {
            // Keys are stored as nested object in document
            keys = keysData.keys;
            console.log(`[FirestoreAuth] ✅ Loaded keys from document (${Object.keys(keys).length} types)`);
          } else {
            console.log(`[FirestoreAuth] ⚠️ Keys document exists but has no keys data`);
          }
        } else {
          console.log(`[FirestoreAuth] ⚠️ Keys document doesn't exist yet, starting with empty keys`);
        }
      } catch (keysError) {
        // Keys document doesn't exist yet or error reading - non-fatal
        console.log(`[FirestoreAuth] ⚠️ Could not load keys (document not found or error): ${keysError.message}`);
        keys = {}; // Start with empty keys
      }

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
        // CRITICAL FIX: Save keys as a document, not individual documents in subcollection
        // wa_metrics/longrun/baileys_auth/keys is a single document containing all keys
        let keyCount = 0;
        try {
          // Count keys before saving
          for (const typeKeys of Object.values(keys)) {
            keyCount += Object.keys(typeKeys).length;
          }
          
          const keysRef = this.db.doc(`${this.basePath}/keys`);
          await keysRef.set({
            keys: JSON.parse(JSON.stringify(keys, BufferJSON.replacer)),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          
          if (keyCount > 0) {
            console.log(`[FirestoreAuth] ✅ Saved ${keyCount} keys to document`);
          }
        } catch (keysError) {
          console.error(`[FirestoreAuth] ❌ Error saving keys: ${keysError.message}`);
        }

        this.lastAuthWriteAt = new Date().toISOString();
        if (keyCount > 0) {
          console.log(`[FirestoreAuth] ✅ Saved auth state (${keyCount} keys)`);
        }
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
      // CRITICAL FIX: Delete keys document (not subcollection)
      try {
        const keysRef = this.db.doc(`${this.basePath}/keys`);
        await keysRef.delete();
        console.log(`[FirestoreAuth] ✅ Deleted keys document`);
      } catch (keysError) {
        // Keys document doesn't exist - non-fatal
        console.log(`[FirestoreAuth] ⚠️ Could not delete keys (document not found): ${keysError.message}`);
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
      
      // CRITICAL FIX: Read keys as document, not collection
      let keyCount = 0;
      try {
        const keysDoc = await this.db.doc(`${this.basePath}/keys`).get();
        
        if (keysDoc.exists) {
          const keysData = keysDoc.data();
          if (keysData && keysData.keys) {
            // Count total keys across all types
            for (const typeKeys of Object.values(keysData.keys)) {
              keyCount += Object.keys(typeKeys).length;
            }
          }
        }
      } catch (keysError) {
        // Keys document doesn't exist - non-fatal, return 0
        // Don't log error if it's just missing document (expected for new instances)
        keyCount = 0;
      }

      return {
        hasAuth: credsDoc.exists,
        credsUpdatedAt: credsDoc.exists ? credsDoc.data().updatedAt : null,
        keyCount: keyCount,
        lastAuthWriteAt: this.lastAuthWriteAt,
      };
    } catch (error) {
      console.error('[FirestoreAuth] Error getting auth state info:', error);
      return {
        hasAuth: false,
        keyCount: 0,
        error: error.message,
      };
    }
  }
}

module.exports = FirestoreAuthState;
