import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import ChatClientiRealtime from '../components/ChatClientiRealtime';

function ChatClientiScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [userCode, setUserCode] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Allow access for GM and Admin
  const hasAccess = currentUser?.email === 'ursache.andrei1995@gmail.com' || 
                    currentUser?.role === 'GM';

  useEffect(() => {
    if (!hasAccess) {
      alert('⛔ Acces interzis! Doar GM și Admin pot accesa această pagină.');
      navigate('/home');
      return;
    }

    // Load user's code from Firestore
    const loadUserCode = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUserCode(userDoc.data().code);
        }
      } catch (error) {
        console.error('Error loading user code:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserCode();
  }, [hasAccess, navigate, currentUser]);

  if (!hasAccess || loading) {
    return null;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <div>
            <h1>💬 Chat Clienti - WhatsApp (GM)</h1>
            <p className="page-subtitle">
              FULL CONTROL - Toate conversațiile WhatsApp
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => navigate('/accounts-management')} 
              className="btn-secondary"
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              ⚙️ Conturi WhatsApp
            </button>
            <button onClick={() => navigate('/home')} className="btn-secondary">
              ← Înapoi
            </button>
          </div>
        </div>
      </div>

      <ChatClientiRealtime isGMMode={true} userCode={userCode} />
    </div>
  );
}

export default ChatClientiScreen;
