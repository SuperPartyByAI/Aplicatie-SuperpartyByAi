import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const WHATSAPP_URL = 'https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp';

function WhatsAppAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');

  useEffect(() => {
    loadAccounts();
    
    // Socket.io pentru QR codes real-time
    const socket = io(WHATSAPP_URL);
    
    socket.on('connect', () => {
      console.log('✅ Connected to WhatsApp backend');
    });
    
    socket.on('whatsapp:qr', (data) => {
      console.log('📱 QR Code received:', data.accountId);
      loadAccounts(); // Refresh pentru a lua QR code-ul nou
    });
    
    socket.on('whatsapp:connected', (data) => {
      console.log('✅ WhatsApp connected:', data.accountId);
      loadAccounts();
    });

    return () => socket.disconnect();
  }, []);

  const loadAccounts = async () => {
    try {
      const response = await fetch(`${WHATSAPP_URL}/api/whatsapp/accounts`);
      const data = await response.json();
      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addAccount = async () => {
    if (!newAccountName.trim()) {
      alert('Introdu un nume pentru cont!');
      return;
    }

    try {
      console.log('🔄 Adding account:', newAccountName);
      const response = await fetch(`${WHATSAPP_URL}/api/whatsapp/add-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAccountName })
      });
      
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📦 Response data:', data);
      
      if (data.success) {
        setShowAddModal(false);
        setNewAccountName('');
        loadAccounts();
        alert('✅ Cont adăugat! Așteaptă QR code...');
      } else {
        throw new Error(data.error || 'Eroare necunoscută');
      }
    } catch (error) {
      console.error('❌ Error adding account:', error);
      alert('❌ Eroare la adăugarea contului: ' + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'connected': return '#10b981';
      case 'qr_ready': return '#f59e0b';
      case 'connecting': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'connected': return '✅ Conectat';
      case 'qr_ready': return '📱 Scanează QR';
      case 'connecting': return '🔄 Se conectează...';
      default: return '⏸️ Deconectat';
    }
  };

  if (loading) {
    return <div style={{padding: '2rem', textAlign: 'center', color: '#9ca3af'}}>Se încarcă...</div>;
  }

  return (
    <div style={{padding: '1rem'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
        <h2 style={{margin: 0, color: 'white'}}>📱 Conturi WhatsApp ({accounts.length})</h2>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          + Adaugă Cont
        </button>
      </div>

      {accounts.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          background: '#1f2937',
          borderRadius: '8px',
          color: '#9ca3af'
        }}>
          <p style={{fontSize: '1.125rem', marginBottom: '0.5rem'}}>📭 Niciun cont WhatsApp</p>
          <p>Adaugă primul cont pentru a începe!</p>
        </div>
      ) : (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem'}}>
          {accounts.map(account => (
            <div
              key={account.id}
              style={{
                background: '#1f2937',
                borderRadius: '8px',
                padding: '1.5rem',
                border: '1px solid #374151'
              }}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem'}}>
                <div>
                  <h3 style={{margin: '0 0 0.5rem 0', color: 'white'}}>{account.name}</h3>
                  <div style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    background: getStatusColor(account.status) + '20',
                    color: getStatusColor(account.status),
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    fontWeight: '600'
                  }}>
                    {getStatusText(account.status)}
                  </div>
                </div>
              </div>

              {account.phone && (
                <p style={{margin: '0.5rem 0', color: '#9ca3af', fontSize: '0.875rem'}}>
                  📞 {account.phone}
                </p>
              )}

              {account.qrCode && account.status === 'qr_ready' && (
                <div style={{marginTop: '1rem', textAlign: 'center'}}>
                  <p style={{color: '#f59e0b', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: '600'}}>
                    📱 Scanează cu WhatsApp:
                  </p>
                  <img 
                    src={account.qrCode} 
                    alt="QR Code" 
                    style={{
                      width: '250px',
                      height: '250px',
                      margin: '0 auto',
                      border: '2px solid #374151',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      background: 'white'
                    }}
                  />
                  <p style={{color: '#6b7280', fontSize: '0.75rem', marginTop: '0.5rem'}}>
                    WhatsApp → Settings → Linked Devices → Link a Device
                  </p>
                </div>
              )}

              {account.status === 'connected' && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#10b98120',
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <p style={{color: '#10b981', margin: 0, fontWeight: '600'}}>
                    ✅ Cont activ și funcțional!
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Adaugă Cont */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#1f2937',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{margin: '0 0 1.5rem 0', color: 'white'}}>Adaugă Cont WhatsApp</h3>
            
            <label style={{display: 'block', marginBottom: '0.5rem', color: '#9ca3af', fontSize: '0.875rem'}}>
              Nume cont:
            </label>
            <input
              type="text"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="Ex: SuperParty Account 1"
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#374151',
                border: '1px solid #4b5563',
                borderRadius: '6px',
                color: 'white',
                marginBottom: '1.5rem'
              }}
              onKeyPress={(e) => e.key === 'Enter' && addAccount()}
            />

            <div style={{display: 'flex', gap: '1rem'}}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewAccountName('');
                }}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Anulează
              </button>
              <button
                onClick={addAccount}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Adaugă
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppAccounts;
