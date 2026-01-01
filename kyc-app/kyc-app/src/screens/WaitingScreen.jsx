import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

function WaitingScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;

  const handleApprove = async () => {
    await setDoc(
      doc(db, 'users', currentUser.uid),
      {
        status: 'approved',
        code: 'SP001',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    window.location.href = '/';
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="screen-container">
      <div className="card">
        <h1>Așteptare aprobare</h1>
        <p>Cont: {currentUser?.email}</p>
        <p>KYC trimis. Așteaptă aprobare admin.</p>
        <div className="alert-info">Pentru demo: apasă butonul pentru aprobare.</div>
        <button onClick={handleApprove}>Simulează aprobare (DEMO)</button>
        <button onClick={handleSignOut}>Sign out</button>
      </div>
    </div>
  );
}

export default WaitingScreen;
