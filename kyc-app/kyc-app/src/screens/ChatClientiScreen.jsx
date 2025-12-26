import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import io from 'socket.io-client';

// Backend Railway URL
const BACKEND_URL = 'https://aplicatie-superpartybyai-production.up.railway.app';

function ChatClientiScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.email === 'ursache.andrei1995@gmail.com';

  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [activeTab, setActiveTab] = useState('available');
  const [searchQuery, setSearchQuery] = useState('');
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      alert('⛔ Acces interzis! Doar administratorul poate accesa această pagină.');
      navigate('/home');
      return;
    }

    // Connect to backend
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    // Load clients from backend
    loadClients();

    // Setup WebSocket listeners
    newSocket.on('whatsapp:message', (data) => {
      console.log('💬 New message received');
      loadClients(); // Reload clients to update unread count
    });

    newSocket.on('client:status_updated', (data) => {
      console.log('📊 Client status updated:', data);
      loadClients();
      setQrCode(null);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [isAdmin, navigate]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/clients`);
      const data = await response.json();
      if (data.success) {
        setClients(data.clients);
      }
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredClients = () => {
    return clients
      .filter(client => client.status === activeTab)
      .filter(client => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          client.name.toLowerCase().includes(query) ||
          client.phone.toLowerCase().includes(query)
        );
      });
  };

  const moveClient = async (clientId, newStatus) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/clients/${clientId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      const data = await response.json();
      if (data.success) {
        // Update local state
        setClients(prev => prev.map(c => 
          c.id === clientId ? { ...c, status: newStatus } : c
        ));
        
        // If selected client was moved, update selection
        if (selectedClient?.id === clientId) {
          setSelectedClient(prev => ({ ...prev, status: newStatus }));
        }
      }
    } catch (error) {
      console.error('Failed to update client status:', error);
      alert('❌ Eroare la actualizarea statusului');
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>💬 Chat Clienti</h1>
            <p className="page-subtitle">{clients.length} clienți</p>
          </div>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0 1rem',
        marginBottom: '1rem'
      }}>
        {['available', 'reserved', 'lost'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.5rem',
              background: activeTab === tab ? '#3b82f6' : '#374151',
              color: activeTab === tab ? 'white' : '#9ca3af',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {tab === 'available' && '✅ Disponibili'}
            {tab === 'reserved' && '⏳ În Rezervare'}
            {tab === 'lost' && '❌ Pierduți'}
            <span style={{
              background: activeTab === tab ? 'rgba(255,255,255,0.2)' : 'rgba(156,163,175,0.2)',
              padding: '0.125rem 0.5rem',
              borderRadius: '12px',
              fontSize: '0.75rem'
            }}>
              {getFilteredClients().length}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 250px)' }}>
        {/* Client list */}
        <div style={{
          width: '350px',
          background: '#1f2937',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #374151' }}>
            <input
              type="text"
              placeholder="🔍 Caută client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#374151',
                border: '1px solid #4b5563',
                borderRadius: '8px',
                color: 'white',
                fontSize: '0.875rem'
              }}
            />
          </div>

          {/* Client list */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.5rem'
          }}>
            {getFilteredClients().length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#9ca3af'
              }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                  {activeTab === 'available' && '✅'}
                  {activeTab === 'reserved' && '⏳'}
                  {activeTab === 'lost' && '❌'}
                </p>
                <p>Niciun client în această categorie</p>
              </div>
            ) : (
              getFilteredClients().map(client => (
                <div
                  key={client.id}
                  onClick={() => setSelectedClient(client)}
                  style={{
                    padding: '1rem',
                    background: selectedClient?.id === client.id ? '#3b82f6' : '#374151',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedClient?.id !== client.id) {
                      e.currentTarget.style.background = '#4b5563';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedClient?.id !== client.id) {
                      e.currentTarget.style.background = '#374151';
                    }
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '0.5rem'
                  }}>
                    <div style={{ fontWeight: '600', color: 'white' }}>
                      {client.name}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: selectedClient?.id === client.id ? '#e0e7ff' : '#9ca3af'
                    }}>
                      {new Date(client.lastMessage).toLocaleTimeString('ro-RO', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: selectedClient?.id === client.id ? '#e0e7ff' : '#9ca3af',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
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
          background: '#1f2937',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {selectedClient ? (
            <>
              {/* Chat header */}
              <div style={{
                padding: '1rem',
                borderBottom: '1px solid #374151',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                    {selectedClient.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                    {selectedClient.phone}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {activeTab === 'available' && (
                    <button
                      onClick={() => moveClient(selectedClient.id, 'reserved')}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '600'
                      }}
                    >
                      ⏳ Marchează În Rezervare
                    </button>
                  )}
                  {activeTab === 'reserved' && (
                    <>
                      <button
                        onClick={() => moveClient(selectedClient.id, 'available')}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '600'
                        }}
                      >
                        ✅ Marchează Disponibil
                      </button>
                      <button
                        onClick={() => moveClient(selectedClient.id, 'lost')}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '600'
                        }}
                      >
                        ❌ Marchează Pierdut
                      </button>
                    </>
                  )}
                  {activeTab === 'lost' && (
                    <button
                      onClick={() => moveClient(selectedClient.id, 'available')}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '600'
                      }}
                    >
                      ✅ Reactivează
                    </button>
                  )}
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
                <div style={{
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '0.875rem',
                  padding: '1rem'
                }}>
                  Conversație cu {selectedClient.name}
                </div>
                {/* Messages will be rendered here */}
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
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
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
    </div>
  );
}

export default ChatClientiScreen;
