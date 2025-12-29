/**
 * Firestore-based auth state for Baileys
 * Feature-flagged implementation: off | creds_only | full
 */

const admin = require('firebase-admin');

// Binary encoding helpers
function encodeBinary(obj) {
  if (!obj) return obj;
  if (Buffer.isBuffer(obj)) return { _type: 'Buffer', data: obj.toString('base64') };
  if (obj instanceof Uint8Array) return { _type: 'Uint8Array', data: Buffer.from(obj).toString('base64') };
  if (Array.isArray(obj)) return obj.map(encodeBinary);
  if (typeof obj === 'object') {
    const encoded = {};
    for (const [key, value] of Object.entries(obj)) {
      encoded[key] = encodeBinary(value);
    }
    return encoded;
  }
  return obj;
}

function decodeBinary(obj) {
  if (!obj) return obj;
  if (obj._type === 'Buffer') return Buffer.from(obj.data, 'base64');
  if (obj._type === 'Uint8Array') return new Uint8Array(Buffer.from(obj.data, 'base64'));
  if (Array.isArray(obj)) return obj.map(decodeBinary);
  if (typeof obj === 'object' && !obj._type) {
    const decoded = {};
    for (const [key, value] of Object.entries(obj)) {
      decoded[key] = decodeBinary(value);
    }
    return decoded;
  }
  return obj;
}

/**
 * Create Firestore auth state handler
 * @param {string} accountId 
 * @param {FirebaseFirestore.Firestore} db 
 * @param {string} mode - 'off' | 'creds_only' | 'full'
 */
async function useFirestoreAuthState(accountId, db, mode = 'off') {
  console.log(`[AUTH] Mode: ${mode} for ${accountId}`);
  
  if (mode === 'off') {
    // Fallback to empty state (will generate QR)
    return {
      state: { creds: null, keys: createEmptyKeys() },
      saveCreds: async () => {}
    };
  }
  
  const sessionRef = db.collection('wa_sessions').doc(accountId);
  
  // Load existing session
  let creds = null;
  let keys = {};
  
  try {
    const sessionDoc = await sessionRef.get();
    
    if (sessionDoc.exists) {
      const data = sessionDoc.data();
      
      if (data.creds) {
        creds = decodeBinary(data.creds);
        console.log(`✅ [${accountId}] Loaded creds from Firestore`);
      }
      
      if (mode === 'full' && data.keys) {
        keys = decodeBinary(data.keys);
        console.log(`✅ [${accountId}] Loaded keys from Firestore`);
      }
    } else {
      console.log(`🆕 [${accountId}] No session in Firestore`);
    }
  } catch (error) {
    console.error(`❌ [${accountId}] Failed to load session:`, error.message);
  }
  
  // Create state object
  const state = {
    creds,
    keys: createKeysHandler(keys, accountId, sessionRef, mode)
  };
  
  // Save credentials function
  const saveCreds = async () => {
    if (mode === 'off') return;
    
    try {
      const update = {
        creds: encodeBinary(state.creds),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        schemaVersion: 1
      };
      
      if (mode === 'full') {
        update.keys = encodeBinary(keys);
      }
      
      await sessionRef.set(update, { merge: true });
      console.log(`💾 [${accountId}] Saved to Firestore (mode: ${mode})`);
    } catch (error) {
      console.error(`❌ [${accountId}] Save failed:`, error.message);
    }
  };
  
  return { state, saveCreds };
}

function createEmptyKeys() {
  return {
    get: async () => ({}),
    set: async () => {}
  };
}

function createKeysHandler(keys, accountId, sessionRef, mode) {
  return {
    get: async (type, ids) => {
      const data = keys[type] || {};
      if (Array.isArray(ids)) {
        return ids.reduce((acc, id) => {
          if (data[id]) acc[id] = data[id];
          return acc;
        }, {});
      }
      return data;
    },
    set: async (data) => {
      if (mode !== 'full') return;
      
      // Merge keys
      for (const [type, typeData] of Object.entries(data)) {
        if (!keys[type]) keys[type] = {};
        Object.assign(keys[type], typeData);
      }
      
      // Save to Firestore (debounced in production)
      try {
        await sessionRef.update({
          keys: encodeBinary(keys),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (error) {
        console.error(`❌ [${accountId}] Keys save failed:`, error.message);
      }
    }
  };
}

module.exports = { useFirestoreAuthState };
