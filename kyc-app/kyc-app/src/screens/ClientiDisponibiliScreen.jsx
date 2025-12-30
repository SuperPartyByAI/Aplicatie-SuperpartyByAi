import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

function ClientiDisponibiliScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [staffProfile, setStaffProfile] = useState(null);
  const [availableConversations, setAvailableConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }

    // Load staff profile
    const loadProfile = async () => {
      const staffDoc = await getDoc(doc(db, 'staffProfiles', currentUser.uid));
      if (staffDoc.exists()) {
        setStaffProfile(staffDoc.data());
      }
    };
    loadProfile();

    // Subscribe to threads (conversations)
    const q = query(
      collection(db, 'threads')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          client_phone: data.clientJid || doc.id,
          unread_count_for_operator: data.unreadCount || 0,
          last_client_message_at: data.lastMessageAt || data.createdAt,
          assigned_operator_code: data.assigned_operator_code || null,
          status: data.assigned_operator_code ? 'RESERVED' : 'AVAILABLE'
        };
      }).filter(conv => conv.status === 'AVAILABLE');
      
      setAvailableConversations(conversations);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, navigate]);

  const handleReserve = async (conversationId) => {
    if (!staffProfile?.code) {
      alert('Cod operator lipsă');
      return;
    }

    try {
      const threadRef = doc(db, 'threads', conversationId);
      await updateDoc(threadRef, {
        assigned_operator_code: staffProfile.code,
        reserved_at: serverTimestamp()
      });
      
      // Navigate to chat
      navigate('/whatsapp/chat');
    } catch (error) {
      console.error('Error reserving conversation:', error);
      alert('Eroare la rezervare');
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'acum';
    if (diffMins < 60) return `acum ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `acum ${diffHours}h`;
    return `acum ${Math.floor(diffHours / 24)} zile`;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>📱 Clienți disponibili</h1>
        <p className="page-subtitle">Conversații WhatsApp nerezervatе</p>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="spinner"></div>
            <p>Se încarcă conversații...</p>
          </div>
        ) : availableConversations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
            <p>Nu există conversații disponibile momentan</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {availableConversations.map(conv => (
              <div 
                key={conv.id}
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>📱</span>
                    <strong>{conv.client_phone}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', color: '#888' }}>
                    <span>
                      🔵 {conv.unread_count_for_operator || 0} mesaje
                    </span>
                    {conv.last_client_message_at && (
                      <span>
                        Ultimul mesaj: {formatTimestamp(conv.last_client_message_at)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleReserve(conv.id)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Preia / Rezervă
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientiDisponibiliScreen;
