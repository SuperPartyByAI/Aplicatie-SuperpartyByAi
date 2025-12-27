const admin = require('firebase-admin');

class ReservationStorage {
  constructor() {
    this.db = null;
    this.reservations = new Map(); // Fallback memory storage
    
    try {
      this.db = admin.firestore();
      console.log('[ReservationStorage] Firestore initialized');
    } catch (error) {
      console.warn('[ReservationStorage] Firestore not available, using memory storage');
    }
  }

  /**
   * Save a new reservation from Voice AI
   */
  async saveReservation(callSid, reservationData, phoneNumber) {
    const reservation = {
      reservationId: this.generateReservationId(),
      callSid,
      phoneNumber,
      date: reservationData.date || null,
      guests: reservationData.guests || null,
      eventType: reservationData.eventType || null,
      preferences: reservationData.preferences || null,
      clientName: reservationData.clientName || null,
      status: 'pending', // pending, confirmed, cancelled
      source: 'voice_ai',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (this.db) {
        await this.db.collection('reservations').doc(reservation.reservationId).set(reservation);
        console.log('[ReservationStorage] Saved to Firestore:', reservation.reservationId);
      } else {
        this.reservations.set(reservation.reservationId, reservation);
        console.log('[ReservationStorage] Saved to memory:', reservation.reservationId);
      }
      
      return reservation;
    } catch (error) {
      console.error('[ReservationStorage] Error saving reservation:', error);
      // Fallback to memory
      this.reservations.set(reservation.reservationId, reservation);
      return reservation;
    }
  }

  /**
   * Get reservation by ID
   */
  async getReservation(reservationId) {
    try {
      if (this.db) {
        const doc = await this.db.collection('reservations').doc(reservationId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
        }
      } else {
        return this.reservations.get(reservationId);
      }
      return null;
    } catch (error) {
      console.error('[ReservationStorage] Error getting reservation:', error);
      return this.reservations.get(reservationId);
    }
  }

  /**
   * Get reservation by call SID
   */
  async getReservationByCallSid(callSid) {
    try {
      if (this.db) {
        const snapshot = await this.db.collection('reservations')
          .where('callSid', '==', callSid)
          .limit(1)
          .get();
        
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          return { id: doc.id, ...doc.data() };
        }
      } else {
        for (const [id, reservation] of this.reservations) {
          if (reservation.callSid === callSid) {
            return reservation;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('[ReservationStorage] Error getting reservation by call:', error);
      return null;
    }
  }

  /**
   * Get recent reservations
   */
  async getRecentReservations(limit = 50) {
    try {
      if (this.db) {
        const snapshot = await this.db.collection('reservations')
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get();
        
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } else {
        return Array.from(this.reservations.values())
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, limit);
      }
    } catch (error) {
      console.error('[ReservationStorage] Error getting recent reservations:', error);
      return [];
    }
  }

  /**
   * Update reservation status
   */
  async updateReservationStatus(reservationId, status, notes = null) {
    try {
      const update = {
        status,
        updatedAt: new Date().toISOString()
      };
      
      if (notes) {
        update.notes = notes;
      }

      if (this.db) {
        await this.db.collection('reservations').doc(reservationId).update(update);
        console.log('[ReservationStorage] Updated status:', reservationId, status);
      } else {
        const reservation = this.reservations.get(reservationId);
        if (reservation) {
          Object.assign(reservation, update);
        }
      }
      
      return true;
    } catch (error) {
      console.error('[ReservationStorage] Error updating status:', error);
      return false;
    }
  }

  /**
   * Get reservation statistics
   */
  async getReservationStats() {
    try {
      if (this.db) {
        const snapshot = await this.db.collection('reservations').get();
        const reservations = snapshot.docs.map(doc => doc.data());
        
        return {
          total: reservations.length,
          pending: reservations.filter(r => r.status === 'pending').length,
          confirmed: reservations.filter(r => r.status === 'confirmed').length,
          cancelled: reservations.filter(r => r.status === 'cancelled').length,
          voiceAI: reservations.filter(r => r.source === 'voice_ai').length,
          operator: reservations.filter(r => r.source === 'operator').length
        };
      } else {
        const reservations = Array.from(this.reservations.values());
        return {
          total: reservations.length,
          pending: reservations.filter(r => r.status === 'pending').length,
          confirmed: reservations.filter(r => r.status === 'confirmed').length,
          cancelled: reservations.filter(r => r.status === 'cancelled').length,
          voiceAI: reservations.filter(r => r.source === 'voice_ai').length,
          operator: reservations.filter(r => r.source === 'operator').length
        };
      }
    } catch (error) {
      console.error('[ReservationStorage] Error getting stats:', error);
      return {
        total: 0,
        pending: 0,
        confirmed: 0,
        cancelled: 0,
        voiceAI: 0,
        operator: 0
      };
    }
  }

  /**
   * Generate unique reservation ID
   */
  generateReservationId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `RES-${timestamp}-${random}`.toUpperCase();
  }
}

module.exports = ReservationStorage;
