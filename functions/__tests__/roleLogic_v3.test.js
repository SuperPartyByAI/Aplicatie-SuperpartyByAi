'use strict';

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'test-project',
  });
}

const { processUrsitoareRoles } = require('../roleLogic_v3');

describe('Role Logic V3', () => {
  describe('processUrsitoareRoles', () => {
    it('should create 3 roles for 3 ursitoare', async () => {
      const roles = await processUrsitoareRoles(1, { numUrsitoare: 3, startTime: '14:00' }, {});
      
      expect(roles).toHaveLength(3);
      expect(roles[0].slot).toBe('01A');
      expect(roles[1].slot).toBe('01B');
      expect(roles[2].slot).toBe('01C');
      
      roles.forEach(r => {
        expect(r.role.durationMin).toBe(60);
        expect(r.role.startTime).toBe('14:00');
      });
    });
    
    it('should create 4 roles for 4 ursitoare (with rea)', async () => {
      const roles = await processUrsitoareRoles(1, { numUrsitoare: 4, startTime: '14:00' }, {});
      
      expect(roles).toHaveLength(4);
      expect(roles[3].role.label).toBe('Ursitoare Rea');
      expect(roles[3].role.details.isRea).toBe(true);
    });
    
    it('should use consecutive slots', async () => {
      const roles = await processUrsitoareRoles(1, { numUrsitoare: 3, startTime: '14:00' }, {});
      
      const slots = roles.map(r => r.slot);
      expect(slots).toEqual(['01A', '01B', '01C']);
    });
  });
});
