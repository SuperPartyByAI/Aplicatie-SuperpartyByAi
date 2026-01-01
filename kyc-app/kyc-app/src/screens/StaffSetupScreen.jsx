import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  query,
  collection,
  where,
  getDocs,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';

function StaffSetupScreen() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [codIdentificare, setCodIdentificare] = useState('');
  const [ceCodAi, setCeCodAi] = useState('');
  const [cineNoteaza, setCineNoteaza] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [userCode, setUserCode] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    
    const loadUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const code = userData?.code || '';

        const kycDoc = await getDocs(
          query(collection(db, 'kycSubmissions'), where('uid', '==', currentUser.uid))
        );
        const kycData = kycDoc.docs[0]?.data();
        const fullName = kycData?.fullName || userData?.displayName || '';

        setUserCode(code);
        setUserName(fullName);
        setCodIdentificare(code);
        setCeCodAi(code);
        setCineNoteaza(code);
      } catch (err) {
        console.error('Error loading user data:', err);
      }
    };
    loadUserData();
  }, [currentUser]);

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      if (!codIdentificare || !ceCodAi || !cineNoteaza)
        throw new Error('Toate câmpurile sunt obligatorii.');

      await setDoc(doc(db, 'staffProfiles', currentUser.uid), {
        uid: currentUser.uid,
        email: currentUser.email,
        nume: userName,
        code: userCode,
        codIdentificare,
        ceCodAi,
        cineNoteaza,
        setupDone: true,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          setupDone: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="screen-container">
        <div className="card">
          <p>Se încarcă...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="screen-container">
        <div className="card">
          <p>Nu ești autentificat. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-container">
      <div className="card">
        <h1>Staff Setup</h1>
        <p>Email: {currentUser.email}</p>
        <p>Cod alocat: {userCode || '(lipsește)'}</p>
        <input
          placeholder="Cod identificare"
          value={codIdentificare}
          onChange={e => setCodIdentificare(e.target.value)}
        />
        <input placeholder="Ce cod ai" value={ceCodAi} onChange={e => setCeCodAi(e.target.value)} />
        <input
          placeholder="Cine notează"
          value={cineNoteaza}
          onChange={e => setCineNoteaza(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button onClick={handleSave} disabled={busy}>
          {busy ? 'Saving...' : 'Salvează'}
        </button>
        <button onClick={handleSignOut}>Sign out</button>
      </div>
    </div>
  );
}

export default StaffSetupScreen;
