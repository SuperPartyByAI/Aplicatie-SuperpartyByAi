const { createUrsitoareRoles } = require('../ursitoareLogic');

describe('createUrsitoareRoles', () => {
  test('creates 3 good ursitoare', () => {
    const roles = createUrsitoareRoles(3, '14:00', 1, []);
    
    expect(roles).toHaveLength(3);
    expect(roles[0].roleType).toBe('ursitoare_buna');
    expect(roles[1].roleType).toBe('ursitoare_buna');
    expect(roles[2].roleType).toBe('ursitoare_buna');
    
    expect(roles[0].slot).toBe('01A');
    expect(roles[1].slot).toBe('01B');
    expect(roles[2].slot).toBe('01C');
    
    expect(roles[0].startTime).toBe('14:00');
    expect(roles[0].durationMin).toBe(60);
  });

  test('creates 3 good + 1 bad ursitoare', () => {
    const roles = createUrsitoareRoles(4, '14:00', 1, []);
    
    expect(roles).toHaveLength(4);
    expect(roles[0].roleType).toBe('ursitoare_buna');
    expect(roles[1].roleType).toBe('ursitoare_buna');
    expect(roles[2].roleType).toBe('ursitoare_buna');
    expect(roles[3].roleType).toBe('ursitoare_rea');
    
    expect(roles[0].slot).toBe('01A');
    expect(roles[1].slot).toBe('01B');
    expect(roles[2].slot).toBe('01C');
    expect(roles[3].slot).toBe('01D');
  });

  test('avoids existing slots', () => {
    const roles = createUrsitoareRoles(3, '14:00', 1, ['01A']);
    
    expect(roles[0].slot).toBe('01B');
    expect(roles[1].slot).toBe('01C');
    expect(roles[2].slot).toBe('01D');
  });

  test('all have same startTime', () => {
    const roles = createUrsitoareRoles(4, '15:30', 2, []);
    
    expect(roles[0].startTime).toBe('15:30');
    expect(roles[1].startTime).toBe('15:30');
    expect(roles[2].startTime).toBe('15:30');
    expect(roles[3].startTime).toBe('15:30');
  });

  test('all have duration 60 minutes', () => {
    const roles = createUrsitoareRoles(4, '14:00', 1, []);
    
    expect(roles[0].durationMin).toBe(60);
    expect(roles[1].durationMin).toBe(60);
    expect(roles[2].durationMin).toBe(60);
    expect(roles[3].durationMin).toBe(60);
  });

  test('throws error for invalid count', () => {
    expect(() => createUrsitoareRoles(2, '14:00', 1, [])).toThrow();
    expect(() => createUrsitoareRoles(5, '14:00', 1, [])).toThrow();
  });
});
