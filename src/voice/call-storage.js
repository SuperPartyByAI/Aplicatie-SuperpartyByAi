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
      this.memoryStore.set(callData.callId, callData);
      console.log('[CallStorage] Call saved to memory:', callData.callId);
      return callData;
    }
    
    try {
      const docRef = this.callsCollection.doc(callData.callId);
      await docRef.set({
        ...callData,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('[CallStorage] Call saved:', callData.callId);
      return callData;
    } catch (error) {
      console.error('[CallStorage] Error saving call:', error);
      throw error;
    }
  }

  /**
   * Update existing call
   */
  async updateCall(callId, updates) {
    if (!this.enabled) {
      const call = this.memoryStore.get(callId);
      if (call) {
        Object.assign(call, updates);
        console.log('[CallStorage] Call updated in memory:', callId);
      }
      return updates;
    }
    
    try {
      const docRef = this.callsCollection.doc(callId);
      await docRef.update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('[CallStorage] Call updated:', callId);
      return updates;
    } catch (error) {
      console.error('[CallStorage] Error updating call:', error);
      throw error;
    }
  }

  /**
   * Get call by ID
   */
  async getCall(callId) {
    if (!this.enabled) {
      return this.memoryStore.get(callId) || null;
    }
    
    try {
      const docRef = this.callsCollection.doc(callId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        return null;
      }

      return {
        callId: doc.id,
        ...doc.data()
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
          callId: doc.id,
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
          callId: doc.id,
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
