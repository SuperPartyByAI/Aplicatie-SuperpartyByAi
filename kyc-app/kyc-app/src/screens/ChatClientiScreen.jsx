import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import ChatClientiRealtime from '../components/ChatClientiRealtime';

function ChatClientiScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  
  // Allow access for GM and Admin
  const hasAccess = currentUser?.email === 'ursache.andrei1995@gmail.com' || 
                    currentUser?.role === 'GM';

  useEffect(() => {
    if (!hasAccess) {
      alert('⛔ Acces interzis! Doar GM și Admin pot accesa această pagină.');
      navigate('/home');
      return;
    }
  }, [hasAccess, navigate]);

  if (!hasAccess) {
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
            <h1>💬 Chat Clienti - WhatsApp</h1>
            <p className="page-subtitle">
              Conversații cu clienții prin WhatsApp
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

      <ChatClientiRealtime />
    </div>
  );
}

export default ChatClientiScreen;
