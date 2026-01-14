import React, { useState, useEffect, useRef } from 'react';
import { db, auth, functions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit as limitQuery,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';

const BACKEND_URL = 'https://whats-upp-production.up.railway.app';

function ChatClientiRealtime({
  isGMMode = false, // GM has FULL CONTROL
  userCode = null, // User's code (e.g., "B15", "Btrainer")
}) {
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [threads, setThreads] = useState([]);
  const [filteredThreads, setFilteredThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('all'); // 'my', 'team', 'all', 'unassigned'
  const [error, setError] = useState(null);

  const threadsListRef = useRef(null);
  const messagesListRef = useRef(null);

  // Prevent scroll propagation for threads and messages lists
  useEffect(() => {
    const preventScrollPropagation = e => {
      const target = e.currentTarget;
      const scrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const height = target.clientHeight;
      const delta = e.deltaY;

      const isAtTop = scrollTop === 0;
      const isAtBottom = scrollTop + height >= scrollHeight;

      if ((isAtTop && delta < 0) || (isAtBottom && delta > 0)) {
        e.preventDefault();
      }

      e.stopPropagation();
    };

    const threadsList = threadsListRef.current;
    const messagesList = messagesListRef.current;

    if (threadsList) {
      threadsList.addEventListener('wheel', preventScrollPropagation, { passive: false });
    }
    if (messagesList) {
      messagesList.addEventListener('wheel', preventScrollPropagation, { passive: false });
    }

    return () => {
      if (threadsList) {
        threadsList.removeEventListener('wheel', preventScrollPropagation);
      }
      if (messagesList) {
        messagesList.removeEventListener('wheel', preventScrollPropagation);
      }
    };
  }, [selectedThread]); // Re-run when selectedThread changes (messages list re-renders)

  // Load connected WhatsApp account
  useEffect(() => {
    loadConnectedAccount();
  }, []);

  // Real-time listener for threads
  useEffect(() => {
    if (!connectedAccount) return;

    console.log(
      `📡 Setting up real-time listener for threads (accountId: ${connectedAccount.id})...`
    );

    // Filter threads by accountId to prevent mixing accounts
    // Note: Removed orderBy to work without Firestore index (sorting done client-side)
    const threadsQuery = query(
      collection(db, 'threads'),
      where('accountId', '==', connectedAccount.id),
      limitQuery(50)
    );

    const unsubscribe = onSnapshot(
      threadsQuery,
      snapshot => {
        const threadsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Sort client-side by lastMessageAt (descending)
        threadsList.sort((a, b) => {
          const aTime = a.lastMessageAt?.toMillis?.() || 0;
          const bTime = b.lastMessageAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        console.log(`📥 Received ${threadsList.length} threads (sorted client-side)`);
        setThreads(threadsList);
        setLoading(false);
        setError(null);
      },
      error => {
        console.error('❌ Error listening to threads:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        // Set user-friendly error message
        let errorMessage = 'Eroare la încărcarea conversațiilor';
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
          errorMessage =
            '⚠️ Index Firestore lipsă. Se construiește automat (2-5 min). Reîmprospătează pagina.';
        } else if (error.code === 'permission-denied') {
          errorMessage = '❌ Permisiuni insuficiente. Contactează administratorul.';
        }

        setError(errorMessage);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [connectedAccount]);

  // Filter threads based on selected filter
  useEffect(() => {
    if (!userCode) {
      setFilteredThreads(threads);
      return;
    }

    const team = userCode.charAt(0); // Extract team letter (e.g., "B" from "B15" or "Btrainer")

    let filtered = threads;
    switch (filter) {
      case 'my':
        // Only threads assigned to me
        filtered = threads.filter(t => t.assignedTo === userCode);
        break;
      case 'team':
        // Threads assigned to my team (same letter)
        filtered = threads.filter(t => t.assignedTo && t.assignedTo.startsWith(team));
        break;
      case 'unassigned':
        // Only unassigned threads
        filtered = threads.filter(t => !t.assignedTo);
        break;
      case 'all':
      default:
        // All threads
        filtered = threads;
        break;
    }

    setFilteredThreads(filtered);
  }, [threads, filter, userCode]);

  // Real-time listener for messages in selected thread
  useEffect(() => {
    if (!selectedThread) return;

    console.log(`📡 Setting up real-time listener for messages in thread ${selectedThread.id}...`);

    const messagesQuery = query(
      collection(db, 'threads', selectedThread.id, 'messages'),
      orderBy('tsClient', 'asc'),
      limitQuery(100)
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      snapshot => {
        const messagesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Calculate latency for outbound messages
        const now = Date.now();
        messagesList.forEach(msg => {
          if (msg.direction === 'outbound' && msg._sendTimestamp) {
            const latency = now - msg._sendTimestamp;
            console.log(
              `⏱️ Message delivery latency: ${latency}ms (${(latency / 1000).toFixed(1)}s)`
            );
          }
        });

        console.log(`📥 Received ${messagesList.length} messages for thread ${selectedThread.id}`);
        setMessages(messagesList);
      },
      error => {
        console.error('❌ Error listening to messages:', error);
      }
    );

    return () => unsubscribe();
  }, [selectedThread]);

  const loadConnectedAccount = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/whatsapp/accounts`);
      const data = await response.json();

      if (data.accounts && data.accounts.length > 0) {
        const connected = data.accounts.find(acc => acc.status === 'connected');
        if (connected) {
          setConnectedAccount(connected);
          console.log('✅ Connected account:', connected.id);
        } else {
          console.warn('⚠️ No connected WhatsApp account');
        }
      }
    } catch (error) {
      console.error('❌ Failed to load accounts:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedThread || !connectedAccount) return;

    // Check permissions (unless GM mode)
    if (!isGMMode && selectedThread.assignedTo && selectedThread.assignedTo !== userCode) {
      alert(`⚠️ Nu poți scrie! Client alocat lui ${selectedThread.assignedTo}`);
      return;
    }

    setSending(true);

    try {
      // Generate deterministic requestId for idempotency
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // If thread is unassigned, assign it to current user (unless GM)
      if (!selectedThread.assignedTo && userCode && !isGMMode) {
        await updateDoc(doc(db, 'threads', selectedThread.id), {
          assignedTo: userCode,
          assignedAt: serverTimestamp(),
        });
        console.log(`✅ Thread assigned to ${userCode}`);
      }

      // Call Functions proxy to send message (server-only outbox writes)
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not authenticated');
      }

      const token = await user.getIdToken();
      const projectId = 'superparty-frontend'; // From firebase config
      const functionsUrl = `https://us-central1-${projectId}.cloudfunctions.net`;

      const startTime = performance.now();
      const response = await fetch(`${functionsUrl}/whatsappProxySend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: selectedThread.id,
          accountId: connectedAccount.id,
          toJid: selectedThread.clientJid,
          text: newMessage,
          clientMessageId: requestId,
        }),
      });

      const writeTime = performance.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Send failed: HTTP ${response.status} - ${errorBody.message || response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ Message queued via proxy (${writeTime.toFixed(0)}ms, duplicate: ${result.duplicate || false})`);

      // Optimistic UI update with timestamp for latency tracking
      const sendTimestamp = Date.now();
      const optimisticMessage = {
        id: `temp_${sendTimestamp}`,
        accountId: connectedAccount.id,
        clientJid: selectedThread.clientJid,
        direction: 'outbound',
        body: newMessage,
        status: 'queued',
        tsClient: new Date().toISOString(),
        createdAt: { seconds: sendTimestamp / 1000 },
        _sendTimestamp: sendTimestamp, // Track when user clicked send
      };

      setMessages(prev => [...prev, optimisticMessage]);
      setNewMessage('');
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      alert('❌ Eroare la trimiterea mesajului');
    } finally {
      setSending(false);
    }
  };

  const handleThreadSelect = thread => {
    setSelectedThread(thread);
    setMessages([]);
  };

  const formatTimestamp = timestamp => {
    if (!timestamp) return '';

    let date;
    if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return '';
    }

    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 24) {
      return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
        Se încarcă conversațiile...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>
          Eroare la încărcarea conversațiilor
        </h2>
        <div
          style={{
            background: '#1f2937',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1rem',
          }}
        >
          <p style={{ color: '#d1d5db', marginBottom: '1rem' }}>{error}</p>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
            Verifică consola browser-ului (F12) pentru detalii tehnice.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          🔄 Reîmprospătează Pagina
        </button>
      </div>
    );
  }

  if (!connectedAccount) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
        <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Niciun cont WhatsApp conectat</h2>
        <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
          Pentru a vedea conversațiile, trebuie să conectezi un cont WhatsApp.
        </p>
        <div
          style={{
            background: '#1f2937',
            padding: '1.5rem',
            borderRadius: '8px',
            textAlign: 'left',
          }}
        >
          <h3 style={{ color: '#10b981', marginBottom: '1rem' }}>📋 Pași pentru conectare:</h3>
          <ol style={{ color: '#d1d5db', lineHeight: '1.8' }}>
            <li>
              Mergi la <strong style={{ color: '#60a5fa' }}>/chat-clienti</strong> sau{' '}
              <strong style={{ color: '#60a5fa' }}>/accounts-management</strong>
            </li>
            <li>
              Click pe tab <strong style={{ color: '#60a5fa' }}>"⚙️ Accounts"</strong>
            </li>
            <li>
              Click pe <strong style={{ color: '#60a5fa' }}>"➕ Add Account"</strong>
            </li>
            <li>
              Scanează <strong style={{ color: '#60a5fa' }}>QR code</strong> cu WhatsApp pe telefon
            </li>
            <li>
              Așteaptă ca status să devină{' '}
              <strong style={{ color: '#10b981' }}>🟢 connected</strong>
            </li>
            <li>Revino aici pentru a vedea conversațiile</li>
          </ol>
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <a
            href="/chat-clienti"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '500',
            }}
          >
            🔗 Conectează Cont WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        height: 'calc(100vh - 180px)',
        maxHeight: '800px',
        minHeight: '400px',
        background: '#1f2937',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Threads list */}
      <div
        style={{
          width: '300px',
          borderRight: '1px solid #374151',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #374151',
          }}
        >
          <div style={{ fontWeight: '600', color: 'white', marginBottom: '0.75rem' }}>
            💬 Conversații ({filteredThreads.length})
          </div>

          {/* Filters - only show if userCode is provided */}
          {userCode && (
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setFilter('my')}
                style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.75rem',
                  background: filter === 'my' ? '#3b82f6' : '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Ai mei
              </button>
              <button
                onClick={() => setFilter('team')}
                style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.75rem',
                  background: filter === 'team' ? '#3b82f6' : '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Echipa
              </button>
              {isGMMode && (
                <button
                  onClick={() => setFilter('unassigned')}
                  style={{
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.75rem',
                    background: filter === 'unassigned' ? '#3b82f6' : '#374151',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Nealocați
                </button>
              )}
              <button
                onClick={() => setFilter('all')}
                style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.75rem',
                  background: filter === 'all' ? '#3b82f6' : '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Toți
              </button>
            </div>
          )}
        </div>
        <div
          ref={threadsListRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            minHeight: 0,
          }}
        >
          {filteredThreads.map(thread => (
            <div
              key={thread.id}
              onClick={() => handleThreadSelect(thread)}
              style={{
                padding: '1rem',
                borderBottom: '1px solid #374151',
                cursor: 'pointer',
                background: selectedThread?.id === thread.id ? '#374151' : 'transparent',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => {
                if (selectedThread?.id !== thread.id) {
                  e.currentTarget.style.background = '#2d3748';
                }
              }}
              onMouseLeave={e => {
                if (selectedThread?.id !== thread.id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.25rem',
                }}
              >
                <div style={{ fontWeight: '500', color: 'white' }}>
                  {thread.clientJid?.split('@')[0] || 'Unknown'}
                </div>
                {thread.assignedTo ? (
                  <div
                    style={{
                      fontSize: '0.625rem',
                      padding: '0.125rem 0.375rem',
                      background: '#10b981',
                      borderRadius: '4px',
                      color: 'white',
                    }}
                  >
                    {thread.assignedTo}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: '0.625rem',
                      padding: '0.125rem 0.375rem',
                      background: '#f59e0b',
                      borderRadius: '4px',
                      color: 'white',
                    }}
                  >
                    Nealoctat
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {thread.lastMessageBody || 'No messages'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                {formatTimestamp(thread.lastMessageAt)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedThread ? (
          <>
            {/* Chat header */}
            <div
              style={{
                padding: '1rem',
                borderBottom: '1px solid #374151',
                fontWeight: '600',
                color: 'white',
              }}
            >
              {selectedThread.clientJid?.split('@')[0] || 'Unknown'}
            </div>

            {/* Messages */}
            <div
              ref={messagesListRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y',
                minHeight: 0,
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {messages
                .filter(msg => {
                  // Filter out messages from Admin and GM
                  const body = msg.body || '';
                  const isAdminMessage = body.includes('[Admin]') || body.includes('[GM]');
                  return !isAdminMessage;
                })
                .map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                      maxWidth: '70%',
                    }}
                  >
                    <div
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        background: msg.direction === 'outbound' ? '#3b82f6' : '#374151',
                        color: 'white',
                      }}
                    >
                      {msg.body}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        marginTop: '0.25rem',
                        textAlign: msg.direction === 'outbound' ? 'right' : 'left',
                      }}
                    >
                      {formatTimestamp(msg.tsClient || msg.createdAt)}{' '}
                      {msg.status === 'queued' && '⏳'}
                      {msg.status === 'sent' && '✓'}
                      {msg.status === 'delivered' && '✓✓'}
                      {msg.status === 'failed' && '⚠️'}
                    </div>
                  </div>
                ))}
            </div>

            {/* Input */}
            {isGMMode || !selectedThread.assignedTo || selectedThread.assignedTo === userCode ? (
              <div
                style={{
                  padding: '1rem',
                  borderTop: '1px solid #374151',
                  display: 'flex',
                  gap: '0.5rem',
                }}
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && sendMessage()}
                  placeholder={
                    !selectedThread.assignedTo
                      ? 'Scrie mesaj... (vei prelua clientul)'
                      : 'Scrie un mesaj...'
                  }
                  disabled={sending}
                  style={{
                    flex: 1,
                    padding: '1rem 1.25rem',
                    borderRadius: '8px',
                    border: '1px solid #374151',
                    background: '#111827',
                    color: 'white',
                    outline: 'none',
                    fontSize: '1rem',
                    minHeight: '48px',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim()}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: sending || !newMessage.trim() ? '#4b5563' : '#3b82f6',
                    color: 'white',
                    cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    minHeight: '48px',
                    minWidth: '60px',
                  }}
                >
                  {sending ? '⏳' : '📤'}
                </button>
              </div>
            ) : (
              <div
                style={{
                  padding: '1rem',
                  borderTop: '1px solid #374151',
                  textAlign: 'center',
                  color: '#94a3b8',
                  background: '#1f2937',
                }}
              >
                🔒 Client alocat lui <strong>{selectedThread.assignedTo}</strong>. Doar vizualizare.
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              padding: '2rem',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                marginBottom: '0.5rem',
                color: 'white',
              }}
            >
              Selectează o conversație
            </div>
            <div style={{ textAlign: 'center', maxWidth: '400px' }}>
              Click pe o conversație din lista din stânga pentru a vedea mesajele și a putea
              răspunde.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatClientiRealtime;
