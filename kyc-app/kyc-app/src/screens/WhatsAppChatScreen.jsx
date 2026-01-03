import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import ChatClientiRealtime from '../components/ChatClientiRealtime';

function WhatsAppChatScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      navigate('/');
      return;
    }
    setLoading(false);
  }, [navigate]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Se încarcă...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', minHeight: '100vh', background: '#111827' }}>
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => navigate('/home')}
          style={{
            padding: '0.5rem 1rem',
            background: '#374151',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ← Înapoi
        </button>
      </div>

      <h1 style={{ color: 'white', marginBottom: '1rem' }}>
        💬 Chat WhatsApp - Conversații Clienți
      </h1>

      <ChatClientiRealtime isGMMode={true} />
    </div>
  );
}

export default WhatsAppChatScreen;
