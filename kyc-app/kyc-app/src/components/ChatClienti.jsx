import React, { useState, useEffect } from 'react';

const BACKEND_URL = 'https://aplicatie-superpartybyai-production.up.railway.app';

// Mock data pentru testare
const MOCK_CLIENTS = [
  { id: '1', name: 'Ion Popescu', phone: '+40721234567', unreadCount: 2 },
  { id: '2', name: 'Maria Ionescu', phone: '+40722345678', unreadCount: 0 },
  { id: '3', name: 'Andrei Georgescu', phone: '+40723456789', unreadCount: 1 }
];

const USE_MOCK_DATA = false; // Backend deploiat pe Railway!

function ChatClienti() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClients();
    // WebSocket connection for real-time updates
    const ws = new WebSocket(`${BACKEND_URL.replace('https', 'wss')}/ws`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message') {
        if (selectedClient && data.clientId === selectedClient.id) {
          setMessages(prev => [...prev, data.message]);
        }
        // Update client list to show new message indicator
        loadClients();
      }
    };

    return () => ws.close();
  }, [selectedClient]);

  const loadClients = async () => {
    try {
      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setClients(MOCK_CLIENTS);
      } else {
        const response = await fetch(`${BACKEND_URL}/api/clients`);
        const data = await response.json();
        if (data.success) {
          setClients(data.clients);
        }
      }
    } catch (error) {
      console.error('Failed to load clients:', error);
      setClients(MOCK_CLIENTS);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (clientId) => {
    try {
      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 300));
        setMessages([
          { id: '1', text: 'Bună ziua!', fromClient: true, timestamp: Date.now() - 600000 },
          { id: '2', text: 'Bună! Cu ce vă pot ajuta?', fromClient: false, timestamp: Date.now() - 500000 },
          { id: '3', text: 'Aș dori să rezerv pentru sâmbătă', fromClient: true, timestamp: Date.now() - 400000 }
        ]);
      } else {
        const response = await fetch(`${BACKEND_URL}/api/clients/${clientId}/messages`);
        const data = await response.json();
        if (data.success) {
          setMessages(data.messages);
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedClient) return;

    try {
      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const msg = {
          id: `msg_${Date.now()}`,
          text: newMessage,
          fromClient: false,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, msg]);
        setNewMessage('');
      } else {
        const response = await fetch(`${BACKEND_URL}/api/clients/${selectedClient.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: newMessage })
        });

        const data = await response.json();
        if (data.success) {
          setMessages(prev => [...prev, data.message]);
          setNewMessage('');
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('❌ Eroare la trimiterea mesajului');
    }
  };

  const handleClientSelect = (client) => {
    setSelectedClient(client);
    loadMessages(client.id);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#9ca3af'
      }}>
        <div>Se încarcă...</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: '1rem',
      height: '600px',
      background: '#1f2937',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* Client list */}
      <div style={{
        width: '300px',
        borderRight: '1px solid #374151',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #374151',
          fontWeight: '600',
          color: 'white'
        }}>
          💬 Clienți ({clients.length})
        </div>
        <div style={{
          flex: 1,
          overflowY: 'auto'
        }}>
          {clients.length === 0 ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#9ca3af'
            }}>
              <p>Niciun client disponibil</p>
            </div>
          ) : (
            clients.map(client => (
              <div
                key={client.id}
                onClick={() => handleClientSelect(client)}
                style={{
                  padding: '1rem',
                  background: selectedClient?.id === client.id ? '#3b82f6' : 'transparent',
                  borderBottom: '1px solid #374151',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (selectedClient?.id !== client.id) {
                    e.currentTarget.style.background = '#374151';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedClient?.id !== client.id) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div style={{
                  fontWeight: '600',
                  color: 'white',
                  marginBottom: '0.25rem'
                }}>
                  {client.name}
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: selectedClient?.id === client.id ? '#e0e7ff' : '#9ca3af'
                }}>
                  {client.phone}
                </div>
                {client.unreadCount > 0 && (
                  <div style={{
                    marginTop: '0.5rem',
                    display: 'inline-block',
                    background: '#ef4444',
                    color: 'white',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {client.unreadCount} nou{client.unreadCount > 1 ? 'e' : ''}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {selectedClient ? (
          <>
            {/* Chat header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid #374151',
              background: '#374151'
            }}>
              <div style={{
                fontWeight: '600',
                fontSize: '1.125rem',
                color: 'white'
              }}>
                {selectedClient.name}
              </div>
              <div style={{
                fontSize: '0.875rem',
                color: '#9ca3af'
              }}>
                {selectedClient.phone}
              </div>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              {messages.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  color: '#9ca3af',
                  padding: '2rem'
                }}>
                  Niciun mesaj încă
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: msg.fromClient ? 'flex-start' : 'flex-end',
                      maxWidth: '70%'
                    }}
                  >
                    <div style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: msg.fromClient ? '#374151' : '#3b82f6',
                      color: 'white'
                    }}>
                      {msg.text}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      marginTop: '0.25rem',
                      textAlign: msg.fromClient ? 'left' : 'right'
                    }}>
                      {new Date(msg.timestamp).toLocaleTimeString('ro-RO', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message input */}
            <div style={{
              padding: '1rem',
              borderTop: '1px solid #374151',
              display: 'flex',
              gap: '0.5rem'
            }}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Scrie un mesaj..."
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#374151',
                  border: '1px solid #4b5563',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '1rem'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: newMessage.trim() ? '#3b82f6' : '#4b5563',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '1rem',
                  fontWeight: '600'
                }}
              >
                Trimite
              </button>
            </div>
          </>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ fontSize: '4rem' }}>💬</div>
            <p style={{ fontSize: '1.25rem' }}>Selectează un client</p>
            <p style={{ fontSize: '0.875rem' }}>
              pentru a vedea conversația
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatClienti;
