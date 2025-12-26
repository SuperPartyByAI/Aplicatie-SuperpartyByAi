import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = 'https://aplicatie-superpartybyai-production.up.railway.app';

// Mock data pentru testare
const MOCK_ACCOUNTS = [
  { id: 'acc1', name: 'Support 1', status: 'connected', phone: '+40721111111' },
  { id: 'acc2', name: 'Vânzări', status: 'connected', phone: '+40722222222' },
  { id: 'acc3', name: 'Marketing', status: 'qr_ready', phone: null }
];

const USE_MOCK_DATA = true;

function WhatsAppAccountManager() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Connect to backend
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    // Load accounts
    loadAccounts();

    // Setup WebSocket listeners
    newSocket.on('whatsapp:qr', (data) => {
      console.log('📱 QR Code received:', data.accountId);
      setQrCode(data.qrCode);
    });

    newSocket.on('whatsapp:ready', (data) => {
      console.log('✅ Account ready:', data.accountId);
      setQrCode(null);
      loadAccounts();
    });

    newSocket.on('whatsapp:auth_failure', (data) => {
      console.error('❌ Auth failed:', data.accountId);
      alert(`❌ Autentificare eșuată pentru ${data.accountId}`);
    });

    newSocket.on('whatsapp:disconnected', (data) => {
      console.log('🔌 Disconnected:', data.accountId);
      loadAccounts();
    });

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setAccounts(MOCK_ACCOUNTS);
      } else {
        const response = await fetch(`${BACKEND_URL}/api/accounts`);
        const data = await response.json();
        if (data.success) {
          setAccounts(data.accounts);
        }
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
      setAccounts(MOCK_ACCOUNTS);
    } finally {
      setLoading(false);
    }
  };

  const addAccount = async (name) => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/accounts/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      
      const data = await response.json();
      if (data.success) {
        setShowAddAccount(false);
        // QR code will come via WebSocket
      } else {
        alert(`❌ Eroare: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to add account:', error);
      alert('❌ Eroare la adăugarea contului');
    } finally {
      setLoading(false);
    }
  };

  const removeAccount = async (accountId) => {
    if (!confirm('Sigur vrei să ștergi acest cont WhatsApp?')) {
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/accounts/${accountId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        loadAccounts();
        if (selectedAccount?.id === accountId) {
          setSelectedAccount(null);
        }
        alert('✅ Cont șters cu succes!');
      }
    } catch (error) {
      console.error('Failed to remove account:', error);
      alert('❌ Eroare la ștergerea contului');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected': return '#10b981';
      case 'qr_ready': return '#f59e0b';
      case 'connecting': return '#3b82f6';
      case 'disconnected': return '#ef4444';
      case 'auth_failed': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'connected': return '✅ Conectat';
      case 'qr_ready': return '📱 Scanează QR';
      case 'connecting': return '⏳ Se conectează...';
      case 'disconnected': return '🔌 Deconectat';
      case 'auth_failed': return '❌ Autentificare eșuată';
      default: return '⚪ Necunoscut';
    }
  };

  return (
    <div style={{
      background: '#1f2937',
      borderRadius: '12px',
      padding: '1.5rem',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem' }}>
          📱 Conturi WhatsApp ({accounts.length}/20)
        </h3>
        <button
          onClick={() => setShowAddAccount(true)}
          disabled={accounts.length >= 20}
          style={{
            padding: '0.5rem 1rem',
            background: accounts.length >= 20 ? '#4b5563' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: accounts.length >= 20 ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: '600'
          }}
        >
          ➕ Adaugă Cont
        </button>
      </div>

      {loading && accounts.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af'
        }}>
          <div>Se încarcă...</div>
        </div>
      ) : accounts.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1rem',
          color: '#9ca3af'
        }}>
          <div style={{ fontSize: '3rem' }}>📱</div>
          <p>Niciun cont WhatsApp adăugat</p>
          <p style={{ fontSize: '0.875rem' }}>
            Apasă butonul de mai sus pentru a adăuga primul cont
          </p>
        </div>
      ) : (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          {accounts.map(account => (
            <div
              key={account.id}
              style={{
                padding: '1rem',
                background: '#374151',
                borderRadius: '8px',
                border: `2px solid ${getStatusColor(account.status)}`
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '0.5rem'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: 'white',
                    marginBottom: '0.25rem'
                  }}>
                    {account.name}
                  </div>
                  {account.phone && (
                    <div style={{
                      fontSize: '0.875rem',
                      color: '#9ca3af'
                    }}>
                      📞 {account.phone}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeAccount(account.id)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  🗑️ Șterge
                </button>
              </div>
              <div style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                background: `${getStatusColor(account.status)}20`,
                color: getStatusColor(account.status),
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                {getStatusText(account.status)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddAccount && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#374151',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'white' }}>
              ➕ Adaugă Cont WhatsApp
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const name = e.target.name.value;
              if (name.trim()) {
                addAccount(name);
              }
            }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#d1d5db',
                  fontSize: '0.875rem'
                }}>
                  Nume cont
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="Ex: Support 1, Vânzări, etc."
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#1f2937',
                    border: '1px solid #4b5563',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => setShowAddAccount(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#4b5563',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: loading ? '#4b5563' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  {loading ? '⏳ Se adaugă...' : 'Adaugă'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>
              📱 Scanează QR Code
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              Deschide WhatsApp pe telefon și scanează acest cod
            </p>
            <img
              src={qrCode}
              alt="QR Code"
              style={{
                width: '300px',
                height: '300px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px'
              }}
            />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Așteptăm scanarea...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppAccountManager;
