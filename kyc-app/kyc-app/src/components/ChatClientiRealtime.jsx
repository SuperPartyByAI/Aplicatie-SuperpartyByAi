import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit as limitQuery,
  onSnapshot,
  addDoc,
  setDoc,
  doc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';

const BACKEND_URL = 'https://whats-upp-production.up.railway.app';

function ChatClientiRealtime() {
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Load connected WhatsApp account
  useEffect(() => {
    loadConnectedAccount();
  }, []);

  // Real-time listener for threads
  useEffect(() => {
    if (!connectedAccount) return;

    console.log(`📡 Setting up real-time listener for threads (accountId: ${connectedAccount.id})...`);

    // Filter threads by accountId to prevent mixing accounts
    const threadsQuery = query(
      collection(db, 'threads'),
      where('accountId', '==', connectedAccount.id),
      orderBy('lastMessageAt', 'desc'),
      limitQuery(50)
    );

    const unsubscribe = onSnapshot(
      threadsQuery,
      snapshot => {
        const threadsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log(`📥 Received ${threadsList.length} threads`);
        setThreads(threadsList);
        setLoading(false);
      },
      error => {
        console.error('❌ Error listening to threads:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [connectedAccount]);

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

    setSending(true);

    try {
      // Generate deterministic requestId for idempotency
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create outbox document with requestId as docId (idempotent)
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

      // Use setDoc with requestId as docId to prevent duplicates
      await setDoc(doc(db, 'outbox', requestId), outboxData);

      console.log('✅ Message queued in outbox');

      // Optimistic UI update
      const optimisticMessage = {
        id: `temp_${Date.now()}`,
        accountId: connectedAccount.id,
        clientJid: selectedThread.clientJid,
        direction: 'outbound',
        body: newMessage,
        status: 'queued',
        tsClient: new Date().toISOString(),
        createdAt: { seconds: Date.now() / 1000 },
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

  if (!connectedAccount) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
        ❌ Niciun cont WhatsApp conectat
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        height: '600px',
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
            fontWeight: '600',
            color: 'white',
          }}
        >
          💬 Conversații ({threads.length})
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.map(thread => (
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
              <div style={{ fontWeight: '500', color: 'white', marginBottom: '0.25rem' }}>
                {thread.clientJid?.split('@')[0] || 'Unknown'}
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
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {messages.map(msg => (
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
                placeholder="Scrie un mesaj..."
                disabled={sending}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #374151',
                  background: '#111827',
                  color: 'white',
                  outline: 'none',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: sending || !newMessage.trim() ? '#4b5563' : '#3b82f6',
                  color: 'white',
                  cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                }}
              >
                {sending ? '⏳' : '📤'}
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
            }}
          >
            Selectează o conversație
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatClientiRealtime;
