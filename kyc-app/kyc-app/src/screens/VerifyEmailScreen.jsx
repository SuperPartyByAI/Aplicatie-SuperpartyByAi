import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { sendEmailVerification, signOut } from 'firebase/auth';

function VerifyEmailScreen() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currentUser = auth.currentUser;

  const handleResend = async () => {
    setBusy(true);
    setMessage('');
    try {
      await sendEmailVerification(currentUser);
      setMessage('Email de verificare trimis!');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerified = async () => {
    setBusy(true);
    try {
      await currentUser.reload();
      window.location.href = '/';
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="screen-container">
      <div className="card">
        <h1>Verify email</h1>
        <p>Email: {currentUser?.email}</p>
        <p>Verifică emailul și apasă butonul.</p>
        {message && <p className="success">{message}</p>}
        <button onClick={handleVerified} disabled={busy}>Am verificat</button>
        <button onClick={handleResend} disabled={busy}>Retrimite email</button>
        <button onClick={handleSignOut} disabled={busy}>Sign out</button>
      </div>
    </div>
  );
}

export default VerifyEmailScreen;
