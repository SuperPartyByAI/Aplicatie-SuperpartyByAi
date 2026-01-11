'use strict';

const RoleDetector = require('../roleDetector');

describe('RoleDetector', () => {
  let roleDetector;

  beforeEach(() => {
    roleDetector = new RoleDetector();
  });

  describe('normalizeText', () => {
    it('should remove diacritics and lowercase', () => {
      expect(roleDetector.normalizeText('Vată de zahăr')).toBe('vata de zahar');
      expect(roleDetector.normalizeText('Ursitoare și Animator')).toBe('ursitoare si animator');
      expect(roleDetector.normalizeText('MOȘCRĂCIUN')).toBe('moscraciun');
    });
  });

  describe('detectRoles', () => {
    it('should detect animator from text', async () => {
      const roles = await roleDetector.detectRoles('Vreau un animator pentru petrecere');
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles[0].label).toBe('Animator');
      expect(roles[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should detect animator from character name', async () => {
      const roles = await roleDetector.detectRoles('Vreau Elsa pentru petrecere');
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles[0].label).toBe('Animator');
    });

    it('should detect MC as animator', async () => {
      const roles = await roleDetector.detectRoles('Am nevoie de MC pentru eveniment');
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles[0].label).toBe('Animator');
    });

    it('should detect ursitoare', async () => {
      const roles = await roleDetector.detectRoles('Vreau 3 ursitoare pentru botez');
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles[0].label).toBe('Ursitoare');
    });

    it('should detect vata de zahar', async () => {
      const roles = await roleDetector.detectRoles('Vreau vată de zahăr');
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles[0].label).toBe('Vată de zahăr');
    });

    it('should detect multiple roles', async () => {
      const roles = await roleDetector.detectRoles(
        'Vreau animator, vată de zahăr și popcorn'
      );
      
      expect(roles.length).toBeGreaterThanOrEqual(3);
      const labels = roles.map(r => r.label);
      expect(labels).toContain('Animator');
      expect(labels).toContain('Vată de zahăr');
      expect(labels).toContain('Popcorn');
    });

    it('should handle text without diacritics', async () => {
      const roles = await roleDetector.detectRoles('vata de zahar si popcorn');
      
      expect(roles.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extractRoleDetails', () => {
    it('should extract animator details', () => {
      const text = 'Animator pentru Maria, 5 ani, personaj Elsa';
      const details = roleDetector.extractRoleDetails(text, 'animator');
      
      expect(details).toBeTruthy();
      expect(details.sarbatoritNume).toBe('Maria');
      expect(details.varstaReala).toBe(5);
      expect(details.personaj).toBe('elsa');
    });

    it('should extract date of birth', () => {
      const text = 'Animator pentru copil născut pe 15-01-2020';
      const details = roleDetector.extractRoleDetails(text, 'animator');
      
      expect(details).toBeTruthy();
      expect(details.dataNastere).toBe('15-01-2020');
    });

    it('should extract ursitoare count', () => {
      const text = '4 ursitoare pentru botez';
      const details = roleDetector.extractRoleDetails(text, 'ursitoare');
      
      expect(details).toBeTruthy();
      expect(details.count).toBe(4);
      expect(details.includesRea).toBe(true);
    });

    it('should default to 3 ursitoare if not specified', () => {
      const text = 'ursitoare pentru botez';
      const details = roleDetector.extractRoleDetails(text, 'ursitoare');
      
      expect(details).toBeTruthy();
      expect(details.count).toBe(3);
    });
  });

  describe('parseDuration', () => {
    it('should parse hours', () => {
      expect(roleDetector.parseDuration('2 ore')).toBe(120);
      expect(roleDetector.parseDuration('1 oră')).toBe(60);
      expect(roleDetector.parseDuration('3h')).toBe(180);
    });

    it('should parse minutes', () => {
      expect(roleDetector.parseDuration('90 minute')).toBe(90);
      expect(roleDetector.parseDuration('30 min')).toBe(30);
      expect(roleDetector.parseDuration('45m')).toBe(45);
    });

    it('should parse decimal hours', () => {
      expect(roleDetector.parseDuration('1.5 ore')).toBe(90);
      expect(roleDetector.parseDuration('2,5 ore')).toBe(150);
      expect(roleDetector.parseDuration('0.5 ore')).toBe(30);
    });

    it('should parse hours and minutes', () => {
      expect(roleDetector.parseDuration('2 ore si 30 minute')).toBe(150);
      expect(roleDetector.parseDuration('1 oră și 15 minute')).toBe(75);
    });

    it('should parse direct numbers', () => {
      expect(roleDetector.parseDuration('120')).toBe(120);
      expect(roleDetector.parseDuration('90')).toBe(90);
      expect(roleDetector.parseDuration('2')).toBe(120); // < 10 = hours
    });

    it('should handle special cases', () => {
      expect(roleDetector.parseDuration('o oră jumătate')).toBe(90);
      expect(roleDetector.parseDuration('jumătate de oră')).toBe(30);
    });
  });

  describe('getAllRoles', () => {
    it('should return all available roles', () => {
      const roles = roleDetector.getAllRoles();
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.some(r => r.label === 'Animator')).toBe(true);
      expect(roles.some(r => r.label === 'Ursitoare')).toBe(true);
      expect(roles.some(r => r.label === 'Vată de zahăr')).toBe(true);
    });

    it('should include requiresDetails flag', () => {
      const roles = roleDetector.getAllRoles();
      const animator = roles.find(r => r.label === 'Animator');
      
      expect(animator.requiresDetails).toBe(true);
    });

    it('should include fixedDuration for ursitoare', () => {
      const roles = roleDetector.getAllRoles();
      const ursitoare = roles.find(r => r.label === 'Ursitoare');
      
      expect(ursitoare.fixedDuration).toBe(60);
    });
  });
});
