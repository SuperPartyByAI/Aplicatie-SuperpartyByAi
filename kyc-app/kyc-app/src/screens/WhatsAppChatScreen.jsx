import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  orderBy 
} from 'firebase/firestore';

function WhatsAppChatScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [staffProfile, setStaffProfile] = useState(null);
  const [reservedConversations, setReservedConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [filteredConversations, setFilteredConversations] = useState([]);
  
  const messagesEndRef = useRef(null);

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
      collection(db, 'whatsapp_threads'),
      orderBy('lastMessageTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('💬 Threads snapshot received:', snapshot.size, 'documents');
      
      const conversations = snapshot.docs
        .map(doc => {
          const data = doc.data();
          
          // Skip if no data or no lastMessageTime
          if (!data || !data.lastMessageTime) {
            return null;
          }
          
          return {
            id: doc.id,
            client_phone: data.phoneNumber || doc.id,
            unread_count_for_operator: data.unreadCount || 0,
            last_client_message_at: data.lastMessageTime,
            assigned_operator_code: data.assigned_operator_code || null,
            reserved_at: data.reserved_at || null,
            status: data.assigned_operator_code ? 'RESERVED' : 'AVAILABLE',
            name: data.name || data.phoneNumber || 'Unknown'
          };
        })
        .filter(conv => conv !== null && conv.status === 'RESERVED');
      
      console.log('✅ Reserved conversations:', conversations.length);
      setReservedConversations(conversations);
      setFilteredConversations(conversations);
      setLoading(false);
    }, (error) => {
      console.error('❌ Error listening to threads:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, navigate]);

  // Subscribe to messages for selected conversation
  useEffect(() => {
    if (!selectedConversation) return;

    const q = query(
      collection(db, 'whatsapp_messages'),
      where('threadId', '==', selectedConversation.id),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          conversation_id: selectedConversation.id,
          sender_type: data.fromMe ? 'OPERATOR' : 'CLIENT',
          sender_operator_code: data.fromMe ? staffProfile?.code : null,
          timestamp: data.timestamp,
          content: data.body || '',
          delivery_status: data.status || 'sent',
          ai_auto_response: false
        };
      });
      setMessages(msgs);
      
      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    return () => unsubscribe();
  }, [selectedConversation, staffProfile]);

  // Apply filters
  useEffect(() => {
    let filtered = [...reservedConversations];

    // Filter by code
    if (filterCode.trim()) {
      filtered = filtered.filter(conv => 
        conv.assigned_operator_code === filterCode.trim()
      );
    }

    // Filter by date
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(conv => {
        const convDate = conv.reserved_at?.toDate ? conv.reserved_at.toDate() : new Date(conv.reserved_at);
        return convDate >= fromDate;
      });
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(conv => {
        const convDate = conv.reserved_at?.toDate ? conv.reserved_at.toDate() : new Date(conv.reserved_at);
        return convDate <= toDate;
      });
    }

    setFilteredConversations(filtered);
  }, [filterCode, dateFrom, dateTo, reservedConversations]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedConversation || !staffProfile?.code) return;
    if (selectedConversation.assigned_operator_code !== staffProfile.code) {
      alert('Doar operatorul rezervant poate răspunde');
      return;
    }

    setSending(true);
    try {
      const messageId = `msg_${Date.now()}`;
      
      // Save to outbox for WhatsApp sending
      await addDoc(collection(db, 'outbox'), {
        accountId: 'account_1767042206934', // Default account
        toJid: selectedConversation.client_phone,
        payload: {
          text: inputMessage.trim()
        },
        status: 'queued',
        createdAt: serverTimestamp(),
        attempts: 0
      });

      // Also save to threads for display
      await addDoc(collection(db, 'threads', selectedConversation.id, 'messages'), {
        accountId: 'operator',
        clientJid: selectedConversation.client_phone,
        direction: 'outbound',
        body: inputMessage.trim(),
        timestamp: serverTimestamp(),
        status: 'queued',
        providerMessageId: messageId
      });

      // Update thread metadata
      await updateDoc(doc(db, 'threads', selectedConversation.id), {
        lastMessageAt: serverTimestamp(),
        lastMessageBody: inputMessage.trim()
      });

      setInputMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Eroare la trimitere mesaj: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleAINotateDate = async () => {
    if (!selectedConversation) return;
    alert('Funcție AI - Notează date esențiale petrecere (Data, Ora, Adresa, Rol)');
    // TODO: Implement AI extraction
  };

  const handleIstoricComplet = async () => {
    if (!selectedConversation) return;
    alert('Funcție - Istoric complet (WhatsApp + Telefon) în timeline cronologic');
    // TODO: Implement timeline view
  };

  const handleTranscriereAudio = async () => {
    if (!selectedConversation) return;
    alert('Funcție - Transcriere audio Telefon');
    // TODO: Implement audio transcription
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  };

  const canWrite = selectedConversation && staffProfile?.code === selectedConversation.assigned_operator_code;

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
        padding: '1rem',
        color: 'white',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>💬</span>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '600' }}>Chat Clienți</h1>
        </div>
        
        {/* Filters Compact */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          flexWrap: 'wrap',
          fontSize: '0.85rem'
        }}>
          <input 
            type="date" 
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ 
              padding: '0.4rem', 
              borderRadius: '20px', 
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: '0.85rem'
            }}
          />
          <input 
            type="date" 
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ 
              padding: '0.4rem', 
              borderRadius: '20px', 
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: '0.85rem'
            }}
          />
          <input 
            type="text" 
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
            placeholder="Cod operator"
            style={{ 
              padding: '0.4rem 0.8rem', 
              borderRadius: '20px', 
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: '0.85rem',
              flex: 1,
              minWidth: '120px'
            }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'white'
        }}>
          <div className="spinner"></div>
        </div>
      ) : (
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: window.innerWidth < 768 ? 'column' : 'row',
          overflow: 'hidden'
        }}>
          {/* Conversations List - Mobile Optimized */}
          <div style={{ 
            width: window.innerWidth < 768 ? '100%' : '320px',
            height: window.innerWidth < 768 && selectedConversation ? '0' : 'auto',
            display: window.innerWidth < 768 && selectedConversation ? 'none' : 'block',
            overflowY: 'auto',
            background: '#151b3d',
            borderRight: window.innerWidth >= 768 ? '1px solid rgba(255,255,255,0.1)' : 'none'
          }}>
            {filteredConversations.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>
                Nu există conversații
              </p>
            ) : (
              filteredConversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  style={{
                    padding: '1rem',
                    background: selectedConversation?.id === conv.id 
                      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)'
                      : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    ':hover': { background: 'rgba(255,255,255,0.05)' }
                  }}
                  onMouseEnter={(e) => {
                    if (selectedConversation?.id !== conv.id) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedConversation?.id !== conv.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>📱</span>
                    <span style={{ fontWeight: '600', color: 'white', fontSize: '0.95rem' }}>
                      {conv.client_phone}
                    </span>
                    {conv.unread_count_for_operator > 0 && (
                      <span style={{
                        background: '#4CAF50',
                        color: 'white',
                        padding: '0.1rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        {conv.unread_count_for_operator}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginLeft: '1.7rem' }}>
                    {conv.assigned_operator_code}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Chat Area - Mobile Optimized */}
          {selectedConversation && (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column',
              background: '#0a0e27',
              position: 'relative'
            }}>
              {/* Chat Header */}
              <div style={{
                padding: '1rem',
                background: '#151b3d',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                {window.innerWidth < 768 && (
                  <button
                    onClick={() => setSelectedConversation(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: '1.5rem',
                      cursor: 'pointer',
                      padding: '0',
                      marginRight: '0.5rem'
                    }}
                  >
                    ←
                  </button>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: 'white', fontSize: '1rem' }}>
                    📱 {selectedConversation.client_phone}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>
                    {selectedConversation.assigned_operator_code}
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                background: 'linear-gradient(180deg, #0a0e27 0%, #151b3d 100%)'
              }}>
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: '1rem',
                      display: 'flex',
                      justifyContent: msg.sender_type === 'CLIENT' ? 'flex-start' : 'flex-end'
                    }}
                  >
                    <div style={{
                      maxWidth: '75%',
                      padding: '0.75rem 1rem',
                      borderRadius: msg.sender_type === 'CLIENT' ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                      background: msg.sender_type === 'CLIENT' 
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : msg.sender_type === 'AI'
                        ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
                        : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                      color: 'white',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: '0.3rem' }}>
                        {msg.sender_type} • {formatTimestamp(msg.timestamp)}
                      </div>
                      <div style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Action Buttons - Mobile Optimized */}
              <div style={{
                padding: '0.75rem',
                background: '#151b3d',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                flexWrap: 'nowrap'
              }}>
                <button
                  onClick={handleAINotateDate}
                  style={{
                    padding: '0.6rem 1rem',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                  }}
                >
                  🤖 Date petrecere
                </button>
                <button
                  onClick={handleIstoricComplet}
                  style={{
                    padding: '0.6rem 1rem',
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(240, 147, 251, 0.3)'
                  }}
                >
                  📜 Istoric
                </button>
                <button
                  onClick={handleTranscriereAudio}
                  style={{
                    padding: '0.6rem 1rem',
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(79, 172, 254, 0.3)'
                  }}
                >
                  🎤 Transcriere
                </button>
              </div>

              {/* Input Area - Mobile Optimized */}
              <div style={{
                padding: '1rem',
                background: '#151b3d',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}>
                {canWrite ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      placeholder="Scrie mesaj..."
                      disabled={sending}
                      style={{
                        flex: 1,
                        padding: '0.75rem 1rem',
                        borderRadius: '25px',
                        border: 'none',
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: '0.95rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !inputMessage.trim()}
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: inputMessage.trim() 
                          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          : 'rgba(255,255,255,0.1)',
                        color: 'white',
                        border: 'none',
                        cursor: sending || !inputMessage.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '1.3rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: inputMessage.trim() ? '0 2px 8px rgba(102, 126, 234, 0.4)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      {sending ? '⏳' : '📤'}
                    </button>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    color: '#888', 
                    padding: '0.5rem',
                    fontSize: '0.9rem'
                  }}>
                    🔒 Doar operatorul rezervant poate răspunde
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!selectedConversation && window.innerWidth >= 768 && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              fontSize: '1.1rem'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
                <div>Selectează o conversație</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WhatsAppChatScreen;
