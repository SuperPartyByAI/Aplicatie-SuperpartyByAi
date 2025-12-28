import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import WhatsAppAccounts from '../components/WhatsAppAccounts';

function ChatClientiScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.email === 'ursache.andrei1995@gmail.com';

  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      alert('⛔ Acces interzis! Doar administratorul poate accesa această pagină.');
      navigate('/home');
      return;
    }

    // Load saved accounts from localStorage
    loadAccounts();
  }, [isAdmin, navigate]);

  const loadAccounts = () => {
    const saved = localStorage.getItem('whatsapp-accounts');
    if (saved) {
      setAccounts(JSON.parse(saved));
    }
  };

  const saveAccounts = (newAccounts) => {
    localStorage.setItem('whatsapp-accounts', JSON.stringify(newAccounts));
    setAccounts(newAccounts);
  };

  const addAccount = (phoneNumber, name) => {
    const newAccount = {
      id: Date.now().toString(),
      phoneNumber,
      name: name || phoneNumber,
      addedAt: new Date().toISOString(),
      webViewKey: `whatsapp-${Date.now()}`
    };

    const updated = [...accounts, newAccount];
    saveAccounts(updated);
    setShowAddAccount(false);
    setSelectedAccount(newAccount);
  };

  const removeAccount = (accountId) => {
    if (!confirm('Sigur vrei să ștergi acest cont WhatsApp? Vei trebui să scanezi QR din nou.')) {
      return;
    }

    const updated = accounts.filter(acc => acc.id !== accountId);
    saveAccounts(updated);
    
    if (selectedAccount?.id === accountId) {
      setSelectedAccount(null);
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
            <h1>💬 Chat Clienti - WhatsApp</h1>
            <p className="page-subtitle">Gestionare conturi WhatsApp cu QR codes</p>
          </div>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
      </div>

      <WhatsAppAccounts />

      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 200px)' }}>
        {/* Sidebar cu lista conturi */}
        <div style={{
          width: '300px',
          background: '#1f2937',
          borderRadius: '8px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <button
            onClick={() => setShowAddAccount(true)}
            style={{
              padding: '1rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Adaugă Cont WhatsApp
          </button>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            {accounts.length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#9ca3af'
              }}>
                <p>📱 Niciun cont adăugat</p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Apasă butonul de mai sus pentru a adăuga primul cont WhatsApp
                </p>
              </div>
            ) : (
              accounts.map(account => (
                <div
                  key={account.id}
                  onClick={() => setSelectedAccount(account)}
                  style={{
                    padding: '1rem',
                    background: selectedAccount?.id === account.id ? '#3b82f6' : '#374151',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedAccount?.id !== account.id) {
                      e.currentTarget.style.background = '#4b5563';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedAccount?.id !== account.id) {
                      e.currentTarget.style.background = '#374151';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600', 
                        color: 'white',
                        marginBottom: '0.25rem'
                      }}>
                        📱 {account.name}
                      </div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: selectedAccount?.id === account.id ? '#e0e7ff' : '#9ca3af'
                      }}>
                        {account.phoneNumber}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAccount(account.id);
                      }}
                      style={{
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main content area */}
        <div style={{
          flex: 1,
          background: '#1f2937',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {showAddAccount ? (
            <AddAccountModal
              onAdd={addAccount}
              onCancel={() => setShowAddAccount(false)}
            />
          ) : selectedAccount ? (
            <WhatsAppWebView account={selectedAccount} />
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
              <p style={{ fontSize: '1.25rem' }}>Selectează un cont WhatsApp</p>
              <p style={{ fontSize: '0.875rem' }}>
                sau adaugă un cont nou pentru a începe
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal pentru adăugare cont
function AddAccountModal({ onAdd, onCancel }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      alert('Te rog introdu numărul de telefon');
      return;
    }
    onAdd(phoneNumber, name);
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        background: '#374151',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '500px',
        width: '100%'
      }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>
          ➕ Adaugă Cont WhatsApp
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              color: '#d1d5db',
              fontSize: '0.875rem'
            }}>
              Nume cont (opțional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Support 1, Vânzări, etc."
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

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              color: '#d1d5db',
              fontSize: '0.875rem'
            }}>
              Număr telefon *
            </label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+40 721 XXX XXX"
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
            <p style={{ 
              fontSize: '0.75rem', 
              color: '#9ca3af', 
              marginTop: '0.5rem' 
            }}>
              Acest număr va fi folosit pentru identificare
            </p>
          </div>

          <div style={{ 
            display: 'flex', 
            gap: '1rem',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={onCancel}
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
              style={{
                padding: '0.75rem 1.5rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              Continuă →
            </button>
          </div>
        </form>

        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: '#1f2937',
          borderRadius: '8px',
          fontSize: '0.875rem',
          color: '#9ca3af'
        }}>
          <p style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#d1d5db' }}>
            ℹ️ Următorii pași:
          </p>
          <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
            <li>Vei vedea un QR code</li>
            <li>Deschide WhatsApp pe telefon</li>
            <li>Apasă "Linked Devices" → "Link a Device"</li>
            <li>Scanează QR code-ul</li>
            <li>Gata! Contul e conectat</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// Component pentru WhatsApp Web
function WhatsAppWebView({ account }) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        background: '#374151',
        borderBottom: '1px solid #4b5563',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.125rem', fontWeight: '600', color: 'white' }}>
            📱 {account.name}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            {account.phoneNumber}
          </div>
        </div>
        <div style={{
          padding: '0.5rem 1rem',
          background: '#10b981',
          borderRadius: '6px',
          fontSize: '0.875rem',
          color: 'white',
          fontWeight: '600'
        }}>
          ✓ Conectat
        </div>
      </div>

      {/* WhatsApp Web iframe */}
      <div style={{ flex: 1, position: 'relative' }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1f2937',
            zIndex: 10
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
              <p style={{ color: '#9ca3af' }}>Se încarcă WhatsApp Web...</p>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                Dacă vezi QR code, scanează-l cu telefonul
              </p>
            </div>
          </div>
        )}
        
        <iframe
          key={account.webViewKey}
          src="https://web.whatsapp.com"
          style={{
            width: '100%',
            height: '100%',
            border: 'none'
          }}
          onLoad={() => setIsLoading(false)}
          title={`WhatsApp - ${account.name}`}
        />
      </div>
    </div>
  );
}

export default ChatClientiScreen;
