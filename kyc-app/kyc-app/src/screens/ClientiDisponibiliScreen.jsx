import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore';

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

    // Subscribe to threads (conversations) - real-time updates
    const q = query(
      collection(db, 'threads'),
      orderBy('lastMessageAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('📱 Threads snapshot received:', snapshot.size, 'documents');
      
      const conversations = snapshot.docs
        .map(doc => {
          const data = doc.data();
          
          // Skip if no data or no lastMessageAt
          if (!data || !data.lastMessageAt) {
            console.log('⚠️ Skipping thread without lastMessageAt:', doc.id);
            return null;
          }
          
          const conv = {
            id: doc.id,
            client_phone: data.clientJid || doc.id,
            unread_count_for_operator: data.unreadCount || 0,
            last_client_message_at: data.lastMessageAt,
            assigned_operator_code: data.assigned_operator_code || null,
            status: data.assigned_operator_code ? 'RESERVED' : 'AVAILABLE'
          };
          
          console.log('📄 Thread:', doc.id, 'Status:', conv.status);
          
          return conv;
        })
        .filter(conv => conv !== null && conv.status === 'AVAILABLE');
      
      console.log('✅ Available conversations:', conversations.length);
      setAvailableConversations(conversations);
      setLoading(false);
    }, (error) => {
      console.error('❌ Error listening to threads:', error);
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
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0e27',
      overflow: 'hidden'
    }}>
      {/* Header Mobile-Friendly */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '1.5rem 1rem',
        color: 'white',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '2rem' }}>📱</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Clienți disponibili</h1>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
              Conversații WhatsApp nerezervatе
            </p>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        background: 'linear-gradient(180deg, #0a0e27 0%, #151b3d 100%)'
      }}>
        {loading ? (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '3rem',
            color: 'white'
          }}>
            <div className="spinner" style={{ marginBottom: '1rem' }}></div>
            <p style={{ fontSize: '0.95rem', opacity: 0.8 }}>Se încarcă conversații...</p>
          </div>
        ) : availableConversations.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem 1rem',
            color: '#888'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
            <p style={{ fontSize: '1.1rem' }}>Nu există conversații disponibile momentan</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {availableConversations.map(conv => (
              <div 
                key={conv.id}
                style={{
                  background: '#151b3d',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                }}
              >
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem', 
                    marginBottom: '0.75rem' 
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)'
                    }}>
                      📱
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '1.1rem', 
                        fontWeight: '600', 
                        color: 'white',
                        marginBottom: '0.2rem'
                      }}>
                        {conv.client_phone}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        gap: '1rem', 
                        fontSize: '0.85rem', 
                        color: '#888',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.2rem 0.6rem',
                          background: 'rgba(76, 175, 80, 0.2)',
                          borderRadius: '12px',
                          color: '#4CAF50',
                          fontWeight: '600'
                        }}>
                          🔵 {conv.unread_count_for_operator || 0} mesaje
                        </span>
                        {conv.last_client_message_at && (
                          <span style={{ opacity: 0.7 }}>
                            🕐 {formatTimestamp(conv.last_client_message_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => handleReserve(conv.id)}
                  style={{
                    width: '100%',
                    padding: '0.9rem',
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '1rem',
                    boxShadow: '0 4px 12px rgba(79, 172, 254, 0.3)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(79, 172, 254, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 172, 254, 0.3)';
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>✋</span>
                  Preia conversația
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
