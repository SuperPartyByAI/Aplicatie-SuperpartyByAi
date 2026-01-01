import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit as limitQuery,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

function RezervaClientiScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [userCode, setUserCode] = useState(null);

  // Check if user has access and load user code
  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }

    // Load user code from Firestore
    const loadUserData = async () => {
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const code = userDoc.data().code;
          setUserCode(code);
          
          if (!code) {
            alert('⚠️ Nu ai cod alocat. Contactează administratorul.');
            navigate('/home');
            return;
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    loadUserData();

    // Load connected WhatsApp account
    fetch('https://whats-upp-production.up.railway.app/api/whatsapp/accounts')
      .then((r) => r.json())
      .then((data) => {
        const connected = data.accounts?.find((acc) => acc.status === 'connected');
        if (connected) {
          setConnectedAccount(connected);
        }
      })
      .catch((err) => console.error('Error loading accounts:', err));
  }, [currentUser, navigate]);

  // Real-time listener for UNASSIGNED threads (Rezervă)
  useEffect(() => {
    if (!connectedAccount) return;

    console.log('📡 Setting up real-time listener for rezervă clienți...');

    const threadsQuery = query(
      collection(db, 'threads'),
      where('accountId', '==', connectedAccount.id),
      where('assignedTo', '==', null), // Only unassigned threads
      orderBy('lastMessageAt', 'desc'),
      limitQuery(50)
    );

    const unsubscribe = onSnapshot(
      threadsQuery,
      (snapshot) => {
        const threadsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log(`📥 Received ${threadsList.length} rezervă threads`);
        setThreads(threadsList);
        setLoading(false);
      },
      (error) => {
        console.error('❌ Error listening to threads:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [connectedAccount]);

  // Real-time listener for messages in selected thread
  useEffect(() => {
    if (!selectedThread) return;

    console.log(`📡 Loading messages for thread: ${selectedThread.id}`);

    const messagesQuery = query(
      collection(db, 'threads', selectedThread.id, 'messages'),
      orderBy('tsClient', 'asc'),
      limitQuery(100)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(messagesList);
    });

    return () => unsubscribe();
  }, [selectedThread]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedThread || !connectedAccount) return;

    setSending(true);

    try {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Check if thread is still unassigned
      if (selectedThread.assignedTo) {
        alert(`⚠️ Acest client a fost deja alocat lui ${selectedThread.assignedTo}!`);
        setSending(false);
        return;
      }

      // ALOCARE AUTOMATĂ - primul care scrie devine owner
      await updateDoc(doc(db, 'threads', selectedThread.id), {
        assignedTo: userCode, // Codul userului (ex: "B15", "Btrainer")
        assignedAt: serverTimestamp(),
      });

      console.log(`✅ Client alocat automat lui ${userCode}`);

      // Create outbox document
      const outboxData = {
        accountId: connectedAccount.id,
        toJid: selectedThread.clientJid,
        payload: { text: newMessage },
        body: newMessage,
        status: 'queued',
        createdAt: serverTimestamp(),
        attempts: 0,
        requestId,
      };

      await setDoc(doc(db, 'outbox', requestId), outboxData);

      setNewMessage('');
      console.log('✅ Message sent to outbox');
    } catch (error) {
      console.error('❌ Error sending message:', error);
      alert('Eroare la trimitere mesaj: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  };

  if (!currentUser) {
    return null;
  }

  if (!connectedAccount) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>📋 Rezervă Clienți</h1>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
          ❌ Niciun cont WhatsApp conectat. Mergi la{' '}
          <a href="/accounts-management" style={{ color: '#60a5fa' }}>
            Conturi WhatsApp
          </a>{' '}
          pentru a conecta un cont.
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>📋 Rezervă Clienți</h1>
            <p className="page-subtitle">Clienți nealocați - primul care răspunde îl preia</p>
          </div>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: '1rem' }}>
        {/* Lista Threads - Stânga */}
        <div
          style={{
            width: window.innerWidth < 768 && selectedThread ? '0' : window.innerWidth < 768 ? '100%' : '350px',
            display: window.innerWidth < 768 && selectedThread ? 'none' : 'flex',
            flexDirection: 'column',
            background: '#1f2937',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '1rem', borderBottom: '1px solid #374151' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
              Clienți Nealocați ({threads.length})
            </h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div className="spinner"></div>
                <p>Se încarcă...</p>
              </div>
            ) : threads.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                📭 Nu există clienți în rezervă
              </div>
            ) : (
              threads.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid #374151',
                    cursor: 'pointer',
                    background: selectedThread?.id === thread.id ? '#374151' : 'transparent',
                  }}
                >
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {thread.clientPhone || thread.clientJid}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                    {thread.lastMessageText?.substring(0, 50)}...
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {formatTime(thread.lastMessageAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Conversație - Dreapta */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#1f2937',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {selectedThread ? (
            <>
              {/* Header Conversație */}
              <div style={{ padding: '1rem', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {window.innerWidth < 768 && (
                  <button
                    onClick={() => setSelectedThread(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: '1.5rem',
                      cursor: 'pointer',
                      padding: '0.5rem',
                    }}
                  >
                    ←
                  </button>
                )}
                <div>
                  <div style={{ fontWeight: '600' }}>{selectedThread.clientPhone || selectedThread.clientJid}</div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                    ⚠️ Nealoctat - primul care răspunde îl preia
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: '1rem',
                      display: 'flex',
                      justifyContent: msg.direction === 'inbound' ? 'flex-start' : 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        background: msg.direction === 'inbound' ? '#374151' : '#3b82f6',
                      }}
                    >
                      <div>{msg.body}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        {formatTime(msg.tsClient)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              {!selectedThread.assignedTo ? (
                <div style={{ padding: '1rem', borderTop: '1px solid #374151' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Scrie mesaj... (vei prelua clientul)"
                      disabled={sending}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: '#374151',
                        border: '1px solid #4b5563',
                        borderRadius: '8px',
                        color: 'white',
                      }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="btn-primary"
                      style={{ padding: '0.75rem 1.5rem' }}
                    >
                      {sending ? '⏳' : '📤'}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.5rem' }}>
                    ⚠️ Când trimiți primul mesaj, clientul devine alocat ție automat
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '1rem',
                    borderTop: '1px solid #374151',
                    textAlign: 'center',
                    color: '#ef4444',
                  }}
                >
                  🔒 Client alocat lui <strong>{selectedThread.assignedTo}</strong>. Nu poți răspunde.
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
              Selectează un client din listă
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RezervaClientiScreen;
