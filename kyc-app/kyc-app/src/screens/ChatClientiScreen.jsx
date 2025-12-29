import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import WhatsAppAccounts from '../components/WhatsAppAccounts';
import ChatClienti from '../components/ChatClienti';

function ChatClientiScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.email === 'ursache.andrei1995@gmail.com';
  const [view, setView] = useState('accounts');
  const [connectedAccount, setConnectedAccount] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      alert('⛔ Acces interzis! Doar administratorul poate accesa această pagină.');
      navigate('/home');
      return;
    }
    
    // Check for connected account
    fetch('https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV3/api/whatsapp/accounts')
      .then(r => r.json())
      .then(data => {
        const connected = data.accounts?.find(acc => acc.status === 'connected');
        if (connected) {
          setConnectedAccount(connected);
          setView('chat');
        }
      })
      .catch(err => console.error('Error:', err));
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>💬 Chat Clienti - WhatsApp</h1>
            <p className="page-subtitle">
              {view === 'chat' ? 'Conversații cu clienții' : 'Gestionare conturi WhatsApp'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {connectedAccount && (
              <>
                <button 
                  onClick={() => setView('chat')} 
                  className={view === 'chat' ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  💬 Chat
                </button>
                <button 
                  onClick={() => setView('accounts')} 
                  className={view === 'accounts' ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  ⚙️ Accounts
                </button>
              </>
            )}
            <button onClick={() => navigate('/home')} className="btn-secondary">
              ← Înapoi
            </button>
          </div>
        </div>
      </div>

      {view === 'accounts' ? <WhatsAppAccounts /> : <ChatClienti />}
    </div>
  );
}

export default ChatClientiScreen;
