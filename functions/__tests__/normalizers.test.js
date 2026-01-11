'use strict';

const {
  normalizeEventFields,
  normalizeRoleFields,
  normalizeRoleType,
  getRoleSynonyms,
  getRoleRequirements,
} = require('../normalizers');

describe('normalizers', () => {
  describe('normalizeEventFields', () => {
    it('should normalize RO fields to EN', () => {
      const input = {
        data: '15-01-2026',
        adresa: 'București, Str. Exemplu 10',
        sarbatoritNume: 'Maria',
        sarbatoritVarsta: 5,
        telefonClientE164: '+40712345678',
      };

      const result = normalizeEventFields(input);

      expect(result.date).toBe('15-01-2026');
      expect(result.address).toBe('București, Str. Exemplu 10');
      expect(result.childName).toBe('Maria');
      expect(result.childAge).toBe(5);
      expect(result.phoneE164).toBe('+40712345678');
    });

    it('should prioritize EN fields over RO', () => {
      const input = {
        date: '15-01-2026',
        data: '16-01-2026', // Should be ignored
        address: 'Address EN',
        adresa: 'Adresa RO', // Should be ignored
      };

      const result = normalizeEventFields(input);

      expect(result.date).toBe('15-01-2026');
      expect(result.address).toBe('Address EN');
    });

    it('should convert numarEveniment to eventShortId', () => {
      const input1 = { numarEveniment: '01' };
      const result1 = normalizeEventFields(input1);
      expect(result1.eventShortId).toBe(1);

      const input2 = { numarEveniment: 42 };
      const result2 = normalizeEventFields(input2);
      expect(result2.eventShortId).toBe(42);

      const input3 = { eventShortId: 99 };
      const result3 = normalizeEventFields(input3);
      expect(result3.eventShortId).toBe(99);
    });

    it('should convert roles[] to rolesBySlot', () => {
      const input = {
        roles: [
          { slot: 'A', label: 'Animator' },
          { slot: 'B', label: 'Ursitoare' },
        ],
      };

      const result = normalizeEventFields(input);

      expect(result.rolesBySlot).toBeDefined();
      expect(result.rolesBySlot['slot1']).toBeDefined();
      expect(result.rolesBySlot['slot2']).toBeDefined();
    });

    it('should normalize payment fields', () => {
      const input1 = {
        incasare: {
          stare: 'NEINCASAT',
          metoda: 'CASH',
          suma: 500,
        },
      };

      const result1 = normalizeEventFields(input1);

      expect(result1.payment.status).toBe('UNPAID');
      expect(result1.payment.method).toBe('CASH');
      expect(result1.payment.amount).toBe(500);
    });

    it('should normalize archive fields', () => {
      const input = {
        esteArhivat: true,
        arhivatLa: 'timestamp',
        arhivatDe: 'user123',
      };

      const result = normalizeEventFields(input);

      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toBe('timestamp');
      expect(result.archivedBy).toBe('user123');
    });
  });

  describe('normalizeRoleFields', () => {
    it('should normalize RO fields to EN', () => {
      const input = {
        cheieRol: 'ANIMATOR',
        eticheta: 'Animator',
        oraStart: '14:00',
        durataMin: 120,
        stare: 'PENDING',
      };

      const result = normalizeRoleFields(input);

      expect(result.roleType).toBe('ANIMATOR');
      expect(result.label).toBe('Animator');
      expect(result.startTime).toBe('14:00');
      expect(result.durationMin).toBe(120);
      expect(result.status).toBe('PENDING');
    });

    it('should prioritize EN fields over RO', () => {
      const input = {
        roleType: 'ANIMATOR',
        cheieRol: 'URSITOARE', // Should be ignored
        label: 'Animator EN',
        eticheta: 'Animator RO', // Should be ignored
      };

      const result = normalizeRoleFields(input);

      expect(result.roleType).toBe('ANIMATOR');
      expect(result.label).toBe('Animator EN');
    });

    it('should normalize assignee fields', () => {
      const input = {
        asignatUid: 'user123',
        asignatCod: 'A13',
        codAtribuit: 'A13',
      };

      const result = normalizeRoleFields(input);

      expect(result.assigneeUid).toBe('user123');
      expect(result.assigneeCode).toBe('A13');
      expect(result.assignedCode).toBe('A13');
    });
  });

  describe('normalizeRoleType', () => {
    it('should normalize animator synonyms', () => {
      expect(normalizeRoleType('animator')).toBe('ANIMATOR');
      expect(normalizeRoleType('animatori')).toBe('ANIMATOR');
      expect(normalizeRoleType('animatoare')).toBe('ANIMATOR');
      expect(normalizeRoleType('entertainer')).toBe('ANIMATOR');
    });

    it('should normalize ursitoare synonyms', () => {
      expect(normalizeRoleType('ursitoare')).toBe('URSITOARE');
      expect(normalizeRoleType('ursitoarea')).toBe('URSITOARE');
      expect(normalizeRoleType('fairy godmother')).toBe('URSITOARE');
    });

    it('should normalize arcade synonyms', () => {
      expect(normalizeRoleType('arcada')).toBe('ARCADE');
      expect(normalizeRoleType('arcadă')).toBe('ARCADE');
      expect(normalizeRoleType('arcade')).toBe('ARCADE');
      expect(normalizeRoleType('jocuri arcade')).toBe('ARCADE');
    });

    it('should normalize cotton candy synonyms', () => {
      expect(normalizeRoleType('vata de zahar')).toBe('COTTON_CANDY');
      expect(normalizeRoleType('vată de zahăr')).toBe('COTTON_CANDY');
      expect(normalizeRoleType('cotton candy')).toBe('COTTON_CANDY');
      expect(normalizeRoleType('candy floss')).toBe('COTTON_CANDY');
    });

    it('should normalize popcorn synonyms', () => {
      expect(normalizeRoleType('popcorn')).toBe('POPCORN');
      expect(normalizeRoleType('pop corn')).toBe('POPCORN');
      expect(normalizeRoleType('floricele')).toBe('POPCORN');
    });

    it('should normalize decorations synonyms', () => {
      expect(normalizeRoleType('decoratiuni')).toBe('DECORATIONS');
      expect(normalizeRoleType('decorațiuni')).toBe('DECORATIONS');
      expect(normalizeRoleType('decorations')).toBe('DECORATIONS');
      expect(normalizeRoleType('decor')).toBe('DECORATIONS');
    });

    it('should normalize balloons synonyms', () => {
      expect(normalizeRoleType('baloane')).toBe('BALLOONS');
      expect(normalizeRoleType('balon')).toBe('BALLOONS');
      expect(normalizeRoleType('balloons')).toBe('BALLOONS');
    });

    it('should normalize helium balloons synonyms', () => {
      expect(normalizeRoleType('baloane heliu')).toBe('HELIUM_BALLOONS');
      expect(normalizeRoleType('baloane cu heliu')).toBe('HELIUM_BALLOONS');
      expect(normalizeRoleType('helium balloons')).toBe('HELIUM_BALLOONS');
    });

    it('should normalize santa claus synonyms', () => {
      expect(normalizeRoleType('mos craciun')).toBe('SANTA_CLAUS');
      expect(normalizeRoleType('moș crăciun')).toBe('SANTA_CLAUS');
      expect(normalizeRoleType('santa')).toBe('SANTA_CLAUS');
      expect(normalizeRoleType('santa claus')).toBe('SANTA_CLAUS');
    });

    it('should normalize dry ice synonyms', () => {
      expect(normalizeRoleType('gheata carbonica')).toBe('DRY_ICE');
      expect(normalizeRoleType('gheață carbonică')).toBe('DRY_ICE');
      expect(normalizeRoleType('dry ice')).toBe('DRY_ICE');
      expect(normalizeRoleType('fum greu')).toBe('DRY_ICE');
    });

    it('should be case-insensitive', () => {
      expect(normalizeRoleType('ANIMATOR')).toBe('ANIMATOR');
      expect(normalizeRoleType('Animator')).toBe('ANIMATOR');
      expect(normalizeRoleType('animator')).toBe('ANIMATOR');
    });

    it('should return null for unknown input', () => {
      expect(normalizeRoleType('fotograf')).toBeNull();
      expect(normalizeRoleType('dj')).toBeNull();
      expect(normalizeRoleType('')).toBeNull();
      expect(normalizeRoleType(null)).toBeNull();
    });
  });

  describe('getRoleSynonyms', () => {
    it('should return all synonyms for a role type', () => {
      const synonyms = getRoleSynonyms('ANIMATOR');
      
      expect(synonyms).toContain('animator');
      expect(synonyms).toContain('animatori');
      expect(synonyms).toContain('animatoare');
      expect(synonyms).toContain('entertainer');
    });

    it('should return empty array for unknown role type', () => {
      const synonyms = getRoleSynonyms('UNKNOWN');
      expect(synonyms).toEqual([]);
    });
  });

  describe('getRoleRequirements', () => {
    it('should return requirements for ANIMATOR', () => {
      const req = getRoleRequirements('ANIMATOR');
      
      expect(req).toBeDefined();
      expect(req.requiredFields).toContain('startTime');
      expect(req.requiredFields).toContain('durationMin');
      expect(req.defaultDuration).toBe(120);
    });

    it('should return requirements for URSITOARE', () => {
      const req = getRoleRequirements('URSITOARE');
      
      expect(req).toBeDefined();
      expect(req.requiredFields).toContain('startTime');
      expect(req.defaultDuration).toBe(60);
    });

    it('should return requirements for ARCADE', () => {
      const req = getRoleRequirements('ARCADE');
      
      expect(req).toBeDefined();
      expect(req.requiredFields).toContain('startTime');
      expect(req.requiredFields).toContain('durationMin');
      expect(req.defaultDuration).toBe(180);
    });

    it('should return requirements for COTTON_CANDY', () => {
      const req = getRoleRequirements('COTTON_CANDY');
      
      expect(req).toBeDefined();
      expect(req.defaultDuration).toBe(120);
    });

    it('should return requirements for POPCORN', () => {
      const req = getRoleRequirements('POPCORN');
      
      expect(req).toBeDefined();
      expect(req.defaultDuration).toBe(120);
    });

    it('should return requirements for DECORATIONS', () => {
      const req = getRoleRequirements('DECORATIONS');
      
      expect(req).toBeDefined();
      expect(req.defaultDuration).toBeNull();
    });

    it('should return requirements for BALLOONS', () => {
      const req = getRoleRequirements('BALLOONS');
      
      expect(req).toBeDefined();
      expect(req.defaultDuration).toBeNull();
    });

    it('should return requirements for HELIUM_BALLOONS', () => {
      const req = getRoleRequirements('HELIUM_BALLOONS');
      
      expect(req).toBeDefined();
      expect(req.defaultDuration).toBeNull();
    });

    it('should return requirements for SANTA_CLAUS', () => {
      const req = getRoleRequirements('SANTA_CLAUS');
      
      expect(req).toBeDefined();
      expect(req.requiredFields).toContain('startTime');
      expect(req.requiredFields).toContain('durationMin');
      expect(req.defaultDuration).toBe(60);
    });

    it('should return requirements for DRY_ICE', () => {
      const req = getRoleRequirements('DRY_ICE');
      
      expect(req).toBeDefined();
      expect(req.requiredFields).toContain('startTime');
      expect(req.defaultDuration).toBeNull();
    });

    it('should return null for unknown role type', () => {
      const req = getRoleRequirements('UNKNOWN');
      expect(req).toBeNull();
    });
  });
});
