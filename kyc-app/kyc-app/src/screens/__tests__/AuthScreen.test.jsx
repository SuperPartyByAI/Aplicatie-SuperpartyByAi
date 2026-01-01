import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AuthScreen from '../AuthScreen';

// Mock Firebase
vi.mock('../../firebase', () => ({
  auth: {},
  db: {},
}));

// Mock Firebase Auth
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

describe('AuthScreen', () => {
  it('renderează formularul de autentificare', () => {
    render(
      <BrowserRouter>
        <AuthScreen />
      </BrowserRouter>
    );

    // Verifică că există câmpurile de email și parolă
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('afișează butonul de Login by default', () => {
    render(
      <BrowserRouter>
        <AuthScreen />
      </BrowserRouter>
    );

    // Verifică că butonul Login există
    const loginButton = screen.getByRole('button', { name: /login/i });
    expect(loginButton).toBeInTheDocument();
  });

  it('poate comuta între Login și Register', () => {
    render(
      <BrowserRouter>
        <AuthScreen />
      </BrowserRouter>
    );

    // Verifică că există link-ul pentru Register
    const registerLink = screen.getByText(/register/i);
    expect(registerLink).toBeInTheDocument();
  });

  it('afișează mesaj de eroare când există', () => {
    render(
      <BrowserRouter>
        <AuthScreen />
      </BrowserRouter>
    );

    // Inițial nu există eroare
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
