import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import WhatsAppAccounts from '../components/WhatsAppAccounts';

function ChatClientiScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.email === 'ursache.andrei1995@gmail.com';

  useEffect(() => {
    if (!isAdmin) {
      alert('⛔ Acces interzis! Doar administratorul poate accesa această pagină.');
      navigate('/home');
      return;
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>💬 Chat Clienti - WhatsApp</h1>
            <p className="page-subtitle">Gestionare conturi WhatsApp cu QR codes</p>
          </div>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
      </div>

      <WhatsAppAccounts />
    </div>
  );
}

export default ChatClientiScreen;
