/**
 * Firestore-based auth state for Baileys
 * Full implementation: creds + keys persistence
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
 */
async function useFirestoreAuthState(accountId, db) {
  console.log(`[AUTH] Firestore auth-state for ${accountId}`);
  
  const sessionRef = db.collection('wa_sessions').doc(accountId);
  
  // Load existing session
  let creds = undefined;
  let keys = {};
  
  try {
    const sessionDoc = await sessionRef.get();
    
    if (sessionDoc.exists) {
      const data = sessionDoc.data();
      
      if (data.creds) {
        creds = decodeBinary(data.creds);
        console.log(`✅ [${accountId}] Loaded creds from Firestore`);
      }
      
      if (data.keys) {
        keys = decodeBinary(data.keys);
        console.log(`✅ [${accountId}] Loaded ${Object.keys(keys).length} key types from Firestore`);
      }
    } else {
      console.log(`🆕 [${accountId}] No session in Firestore, will generate QR`);
    }
  } catch (error) {
    console.error(`❌ [${accountId}] Failed to load session:`, error.message);
    // Continue with undefined creds to generate QR
  }
  
  // Create state object
  const state = {
    creds,
    keys: createKeysHandler(keys, accountId, sessionRef)
  };
  
  // Save credentials function
  const saveCreds = async () => {
    try {
      const update = {
        creds: encodeBinary(state.creds),
        keys: encodeBinary(keys),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        schemaVersion: 1
      };
      
      await sessionRef.set(update, { merge: true });
      console.log(`💾 [${accountId}] Session saved to Firestore`);
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

function createKeysHandler(keys, accountId, sessionRef) {
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
      // Merge keys
      for (const [type, typeData] of Object.entries(data)) {
        if (!keys[type]) keys[type] = {};
        Object.assign(keys[type], typeData);
      }
      
      // Save to Firestore
      try {
        await sessionRef.set({
          keys: encodeBinary(keys),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`💾 [${accountId}] Keys saved to Firestore (${Object.keys(data).join(', ')})`);
      } catch (error) {
        console.error(`❌ [${accountId}] Keys save failed:`, error.message);
      }
    }
  };
}

module.exports = { useFirestoreAuthState };
