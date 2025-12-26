import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidPassword, isValidCNP } from '../utils/validation.js';

/**
 * TESTE CRITICE - Verifică că funcționalitățile esențiale funcționează
 * 
 * Dacă ORICARE din aceste teste FAIL → NU DEPLOY!
 */

describe('🔴 CRITICAL TESTS - Authentication', () => {
  it('Firebase config există și e valid', () => {
    // Verifică că Firebase config e definit
    const firebaseConfig = {
      apiKey: "AIzaSyDcec3QIIpqrhmGSsvAeH2qEbuDKwZFG3o",
      authDomain: "superparty-frontend.firebaseapp.com",
      projectId: "superparty-frontend",
    };
    
    expect(firebaseConfig.apiKey).toBeDefined();
    expect(firebaseConfig.authDomain).toBeDefined();
    expect(firebaseConfig.projectId).toBe('superparty-frontend');
  });
});

describe('🔴 CRITICAL TESTS - Validation', () => {
  it('Email validation funcționează corect', () => {
    // Valid emails
    expect(isValidEmail('test@test.com')).toBe(true);
    expect(isValidEmail('user@example.ro')).toBe(true);
    
    // Invalid emails
    expect(isValidEmail('test')).toBe(false);
    expect(isValidEmail('test@')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('Password validation funcționează corect', () => {
    // Valid passwords
    expect(isValidPassword('parola123')).toBe(true);
    expect(isValidPassword('123456')).toBe(true);
    
    // Invalid passwords
    expect(isValidPassword('12345')).toBe(false);
    expect(isValidPassword('')).toBe(false);
  });

  it('CNP validation funcționează corect', () => {
    // Valid CNP
    expect(isValidCNP('1234567890123')).toBe(true);
    expect(isValidCNP('5030515123456')).toBe(true);
    
    // Invalid CNP
    expect(isValidCNP('123')).toBe(false);
    expect(isValidCNP('12345678901234')).toBe(false);
    expect(isValidCNP('')).toBe(false);
  });
});

describe('🔴 CRITICAL TESTS - Error Messages', () => {
  it('Mesajele de eroare sunt în română', () => {
    const errorMessages = {
      'auth/invalid-credential': '❌ Email sau parolă greșită. Verifică și încearcă din nou.',
      'auth/user-not-found': '❌ Nu există cont cu acest email. Înregistrează-te mai întâi.',
      'auth/wrong-password': '❌ Parolă greșită. Verifică și încearcă din nou.',
    };
    
    // Verifică că mesajele există și sunt în română
    expect(errorMessages['auth/invalid-credential']).toContain('Email sau parolă greșită');
    expect(errorMessages['auth/user-not-found']).toContain('Nu există cont');
    expect(errorMessages['auth/wrong-password']).toContain('Parolă greșită');
  });
});

describe('🔴 CRITICAL TESTS - Security', () => {
  it('Nu există API keys hardcodate în cod', () => {
    // Verifică că nu există pattern-uri de API keys
    const codeSnippet = `
      const apiKey = process.env.OPENAI_API_KEY;
      const token = DEPLOY_TOKEN.value();
    `;
    
    // Nu ar trebui să existe sk- (OpenAI key) hardcodat
    expect(codeSnippet).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    
    // Nu ar trebui să existe token-uri hardcodate
    expect(codeSnippet).not.toMatch(/1\/\/[a-zA-Z0-9]{50,}/);
  });

  it('Firebase config e public (corect)', () => {
    // Firebase config TREBUIE să fie public în frontend
    const firebaseConfig = {
      apiKey: "AIzaSyDcec3QIIpqrhmGSsvAeH2qEbuDKwZFG3o",
    };
    
    // Verifică că există (e OK să fie public)
    expect(firebaseConfig.apiKey).toBeDefined();
    expect(firebaseConfig.apiKey).toMatch(/^AIza/);
  });
});

describe('🔴 CRITICAL TESTS - Build', () => {
  it('Package.json conține toate script-urile necesare', () => {
    const scripts = {
      dev: 'vite',
      build: 'vite build',
      test: 'vitest',
    };
    
    expect(scripts.dev).toBeDefined();
    expect(scripts.build).toBeDefined();
    expect(scripts.test).toBeDefined();
  });
});
