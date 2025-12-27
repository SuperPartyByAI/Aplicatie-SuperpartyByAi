const admin = require('firebase-admin');

class CallStorage {
  constructor() {
    try {
      this.db = admin.firestore();
      this.callsCollection = this.db.collection('calls');
      this.enabled = true;
    } catch (error) {
      console.warn('[CallStorage] Firebase not available, running in memory mode');
      this.enabled = false;
      this.memoryStore = new Map();
    }
  }

  /**
   * Save new call to Firestore
   */
  async saveCall(callData) {
    if (!this.enabled) {
      const uniqueId = `${callData.callId}_${Date.now()}`;
      this.memoryStore.set(uniqueId, { ...callData, id: uniqueId });
      console.log('[CallStorage] Call saved to memory:', uniqueId);
      return { ...callData, id: uniqueId };
    }
    
    try {
      // Use auto-generated ID instead of CallSid to allow multiple calls with same CallSid
      const docRef = this.callsCollection.doc();
      const callWithId = {
        ...callData,
        id: docRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      await docRef.set(callWithId);
      console.log('[CallStorage] Call saved:', docRef.id, 'CallSid:', callData.callId);
      return callWithId;
    } catch (error) {
      console.error('[CallStorage] Error saving call:', error);
      throw error;
    }
  }

  /**
   * Update existing call by CallSid
   */
  async updateCall(callId, updates) {
    if (!this.enabled) {
      // Find call in memory by callId
      for (const [key, call] of this.memoryStore.entries()) {
        if (call.callId === callId) {
          Object.assign(call, updates);
          console.log('[CallStorage] Call updated in memory:', callId);
          return updates;
        }
      }
      return updates;
    }
    
    try {
      // Find most recent call with this CallSid
      const snapshot = await this.callsCollection
        .where('callId', '==', callId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        console.warn('[CallStorage] No call found with CallSid:', callId);
        return updates;
      }
      
      const docRef = snapshot.docs[0].ref;
      await docRef.update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('[CallStorage] Call updated:', docRef.id, 'CallSid:', callId);
      return updates;
    } catch (error) {
      console.error('[CallStorage] Error updating call:', error);
      throw error;
    }
  }

  /**
   * Get call by CallSid (returns most recent)
   */
  async getCall(callId) {
    if (!this.enabled) {
      // Find in memory by callId
      for (const call of this.memoryStore.values()) {
        if (call.callId === callId) {
          return call;
        }
      }
      return null;
    }
    
    try {
      // Find most recent call with this CallSid
      const snapshot = await this.callsCollection
        .where('callId', '==', callId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }

      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      };
    } catch (error) {
      console.error('[CallStorage] Error getting call:', error);
      throw error;
    }
  }

  /**
   * Get recent calls (last 100)
   */
  async getRecentCalls(limit = 100) {
    if (!this.enabled) {
      return Array.from(this.memoryStore.values()).slice(0, limit);
    }
    
    try {
      const snapshot = await this.callsCollection
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const calls = [];
      snapshot.forEach(doc => {
        calls.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return calls;
    } catch (error) {
      console.error('[CallStorage] Error getting recent calls:', error);
      throw error;
    }
  }

  /**
   * Get calls by date range
   */
  async getCallsByDateRange(startDate, endDate) {
    if (!this.enabled) {
      return Array.from(this.memoryStore.values()).filter(call => {
        const callDate = new Date(call.createdAt);
        return callDate >= startDate && callDate <= endDate;
      });
    }
    
    try {
      const snapshot = await this.callsCollection
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .orderBy('createdAt', 'desc')
        .get();

      const calls = [];
      snapshot.forEach(doc => {
        calls.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return calls;
    } catch (error) {
      console.error('[CallStorage] Error getting calls by date range:', error);
      throw error;
    }
  }

  /**
   * Get call statistics
   */
  async getCallStats(startDate, endDate) {
    try {
      const calls = await this.getCallsByDateRange(startDate, endDate);

      const stats = {
        total: calls.length,
        inbound: 0,
        outbound: 0,
        answered: 0,
        missed: 0,
        rejected: 0,
        totalDuration: 0,
        avgDuration: 0
      };

      calls.forEach(call => {
        if (call.direction === 'inbound') stats.inbound++;
        if (call.direction === 'outbound') stats.outbound++;
        if (call.status === 'completed') stats.answered++;
        if (call.status === 'no-answer') stats.missed++;
        if (call.status === 'rejected') stats.rejected++;
        if (call.duration) stats.totalDuration += call.duration;
      });

      stats.avgDuration = stats.answered > 0 
        ? Math.round(stats.totalDuration / stats.answered) 
        : 0;

      return stats;
    } catch (error) {
      console.error('[CallStorage] Error getting call stats:', error);
      throw error;
    }
  }
}

module.exports = CallStorage;
