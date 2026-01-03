import { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (!email || !password) throw new Error('Email și parola sunt obligatorii.');

      if (isRegister) {
        if (!phone) throw new Error('Telefonul este obligatoriu.');
        if (!password2) throw new Error('Confirmă parola.');
        if (password !== password2) throw new Error('Parolele nu coincid.');

        // Creează user în Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Trimite email de verificare
        await sendEmailVerification(user);

        // Creează document în Firestore
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: email,
          phone: phone,
          status: 'kyc_required',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        window.location.href = '/';
      } else {
        // Login cu Firebase
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = '/';
      }
    } catch (err) {
      // Traducere erori Firebase în română
      let errorMessage = err.message;
      
      // Erori de autentificare
      if (err.code === 'auth/invalid-credential') {
        errorMessage = '❌ Email sau parolă greșită. Verifică și încearcă din nou.';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = '❌ Nu există cont cu acest email. Înregistrează-te mai întâi.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = '❌ Parolă greșită. Verifică și încearcă din nou.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = '❌ Email invalid. Verifică formatul email-ului.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = '❌ Email-ul este deja folosit. Încearcă să te loghezi sau folosește alt email.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = '❌ Parola este prea slabă. Folosește minim 6 caractere.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = '❌ Prea multe încercări. Așteaptă câteva minute și încearcă din nou.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = '❌ Eroare de conexiune. Verifică internetul și încearcă din nou.';
      }
      
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-container">
      <div className="card">
        <h1>{isRegister ? 'Create account' : 'Login'}</h1>
        <form onSubmit={handleSubmit}>
          <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {isRegister && (
            <>
              <input placeholder="Confirm password" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              <input placeholder="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </>
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>{busy ? 'Wait...' : (isRegister ? 'Register' : 'Login')}</button>
          <button type="button" onClick={() => setIsRegister(!isRegister)}>{isRegister ? 'Login' : 'Register'}</button>
        </form>
      </div>
    </div>
  );
}

export default AuthScreen;
