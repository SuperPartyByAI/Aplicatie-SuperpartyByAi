/**
 * Firestore-based auth state for Baileys
 * Replaces disk-based useMultiFileAuthState
 */

const admin = require('firebase-admin');

/**
 * Create Firestore auth state handler
 * @param {string} accountId - Account identifier
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @returns {Promise<{state: AuthenticationState, saveCreds: Function}>}
 */
async function useFirestoreAuthState(accountId, db) {
  const sessionRef = db.collection('wa_sessions').doc(accountId);
  
  // Load existing session or create empty
  const sessionDoc = await sessionRef.get();
  let creds = null;
  let keys = {};
  
  if (sessionDoc.exists) {
    const data = sessionDoc.data();
    creds = data.creds || null;
    keys = data.keys || {};
    console.log(`📦 [${accountId}] Loaded session from Firestore (updated: ${data.updatedAt?.toDate()})`);
  } else {
    console.log(`🆕 [${accountId}] No session in Firestore, starting fresh`);
  }
  
  // Create state object
  const state = {
    creds,
    keys: {
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
        // Merge keys incrementally
        for (const [type, typeData] of Object.entries(data)) {
          if (!keys[type]) keys[type] = {};
          Object.assign(keys[type], typeData);
        }
        
        // Save to Firestore (debounced in production)
        await saveToFirestore();
      }
    }
  };
  
  // Save function
  async function saveToFirestore() {
    try {
      await sessionRef.set({
        creds: state.creds,
        keys,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        schemaVersion: 1
      }, { merge: true });
      
      console.log(`💾 [${accountId}] Session saved to Firestore`);
    } catch (error) {
      console.error(`❌ [${accountId}] Failed to save session:`, error.message);
    }
  }
  
  // Save credentials function
  const saveCreds = async () => {
    await saveToFirestore();
  };
  
  return { state, saveCreds };
}

module.exports = { useFirestoreAuthState };
