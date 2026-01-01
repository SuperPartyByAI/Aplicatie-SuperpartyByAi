import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import * as Sentry from '@sentry/react';
import logtail from '../logtail';

const WHATSAPP_URL = 'https://whats-upp-production.up.railway.app';

function WhatsAppAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountPhone, setNewAccountPhone] = useState('');
  const [editingAccount, setEditingAccount] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadAccounts();

    // Polling pentru QR codes (Firebase Functions nu suportă Socket.io persistent)
    const pollInterval = setInterval(() => {
      loadAccounts();
    }, 3000); // Refresh la fiecare 3 secunde

    return () => clearInterval(pollInterval);
  }, []);

  const loadAccounts = async () => {
    try {
      const response = await Sentry.startSpan(
        { op: 'http.client', name: 'GET /api/whatsapp/accounts' },
        () => fetch(`${WHATSAPP_URL}/api/whatsapp/accounts`)
      );
      const data = await response.json();
      console.log('📱 WhatsApp accounts loaded:', data.accounts);
      logtail.info('WhatsApp accounts loaded', { count: data.accounts?.length || 0 });
      if (data.success) {
        setAccounts(data.accounts);
        // Log QR code status
        data.accounts.forEach(acc => {
          console.log(`Account ${acc.name}: status=${acc.status}, hasQR=${!!acc.qrCode}`);
        });
      }
    } catch (error) {
      console.error('❌ Error loading accounts:', error);
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
      console.log('🔄 Adding account:', newAccountName, 'phone:', newAccountPhone);
      const response = await fetch(`${WHATSAPP_URL}/api/whatsapp/add-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccountName,
          phone: newAccountPhone || undefined, // Send only if provided
        }),
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
        setNewAccountPhone('');
        loadAccounts();
        alert(
          '✅ Cont adăugat! Așteaptă QR code' + (newAccountPhone ? ' și pairing code' : '') + '...'
        );
      } else {
        throw new Error(data.error || 'Eroare necunoscută');
      }
    } catch (error) {
      console.error('❌ Error adding account:', error);
      alert('❌ Eroare la adăugarea contului: ' + error.message);
    }
  };

  const updateAccountName = async (accountId) => {
    if (!editName.trim()) {
      alert('❌ Numele nu poate fi gol');
      return;
    }

    try {
      const response = await fetch(`${WHATSAPP_URL}/api/whatsapp/accounts/${accountId}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Account name updated:', data.account);
        setEditingAccount(null);
        setEditName('');
        loadAccounts();
      } else {
        throw new Error(data.error || 'Eroare necunoscută');
      }
    } catch (error) {
      console.error('❌ Error updating account name:', error);
      alert('❌ Eroare la actualizarea numelui: ' + error.message);
    }
  };

  const disconnectAccount = async accountId => {
    if (!confirm('Sigur vrei să deconectezi acest cont?')) {
      return;
    }

    try {
      console.log('🔌 Disconnecting account:', accountId);
      const response = await fetch(`${WHATSAPP_URL}/api/whatsapp/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📦 Disconnect response:', data);

      if (data.success) {
        loadAccounts();
        alert('✅ Cont deconectat cu succes!');
      } else {
        throw new Error(data.error || 'Eroare necunoscută');
      }
    } catch (error) {
      console.error('❌ Error disconnecting account:', error);
      alert('❌ Eroare la deconectare: ' + error.message);
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'connected':
        return '#10b981'; // green
      case 'qr_ready':
      case 'awaiting_scan':
        return '#f59e0b'; // orange
      case 'connecting':
      case 'reconnecting':
        return '#3b82f6'; // blue
      case 'disconnected':
      case 'logged_out':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusText = status => {
    switch (status) {
      case 'connected':
        return '✅ Conectat';
      case 'qr_ready':
        return '📱 QR Gata - Scanează!';
      case 'awaiting_scan':
        return '⏳ Așteaptă Scanare QR';
      case 'connecting':
        return '🔄 Se conectează...';
      case 'reconnecting':
        return '🔄 Reconectare...';
      case 'disconnected':
        return '⏸️ Deconectat';
      case 'logged_out':
        return '🚪 Delogat';
      case 'needs_qr':
        return '🔑 Necesită QR';
      default:
        return `⚠️ ${status || 'Necunoscut'}`;
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Se încarcă...</div>
    );
  }

  return (
    <div
      style={{
        padding: '1rem',
        maxWidth: '100%',
        overflowX: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: window.innerWidth < 768 ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: window.innerWidth < 768 ? 'stretch' : 'center',
          marginBottom: '1.5rem',
          gap: '1rem',
        }}
      >
        <h2
          style={{
            margin: 0,
            background: 'linear-gradient(135deg, #00f5ff 0%, #00ff88 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontSize: window.innerWidth < 768 ? '1.5rem' : '2rem',
            fontWeight: '800',
            textShadow: '0 0 20px rgba(0, 245, 255, 0.5)',
          }}
        >
          📱 Conturi WhatsApp ({accounts.length})
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, #00f5ff 0%, #00ff88 100%)',
            color: '#0a0a0a',
            border: '2px solid #00f5ff',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '700',
            fontSize: window.innerWidth < 768 ? '1rem' : '1.1rem',
            boxShadow: '0 0 20px rgba(0, 245, 255, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2)',
            transition: 'all 0.3s ease',
            width: window.innerWidth < 768 ? '100%' : 'auto',
          }}
          onMouseOver={e => {
            e.target.style.transform = 'scale(1.05)';
            e.target.style.boxShadow =
              '0 0 30px rgba(0, 245, 255, 0.8), inset 0 0 15px rgba(255, 255, 255, 0.3)';
          }}
          onMouseOut={e => {
            e.target.style.transform = 'scale(1)';
            e.target.style.boxShadow =
              '0 0 20px rgba(0, 245, 255, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2)';
          }}
        >
          + Adaugă Cont
        </button>
      </div>

      {accounts.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: 'rgba(0, 245, 255, 0.05)',
            border: '2px solid rgba(0, 245, 255, 0.3)',
            borderRadius: '16px',
            color: '#00f5ff',
            boxShadow: '0 0 30px rgba(0, 245, 255, 0.2)',
          }}
        >
          <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem', fontWeight: '600' }}>
            📭 Niciun cont WhatsApp
          </p>
          <p style={{ color: '#00ff88' }}>Adaugă primul cont pentru a începe!</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              window.innerWidth < 768 ? '1fr' : 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {accounts.map(account => (
            <div
              key={account.id}
              style={{
                background:
                  'linear-gradient(135deg, rgba(0, 10, 20, 0.9) 0%, rgba(0, 20, 40, 0.9) 100%)',
                borderRadius: '16px',
                padding: '1.5rem',
                border: '2px solid rgba(0, 245, 255, 0.3)',
                boxShadow:
                  '0 0 20px rgba(0, 245, 255, 0.2), inset 0 0 20px rgba(0, 245, 255, 0.05)',
                transition: 'all 0.3s ease',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'rgba(0, 245, 255, 0.6)';
                e.currentTarget.style.boxShadow =
                  '0 0 30px rgba(0, 245, 255, 0.4), inset 0 0 30px rgba(0, 245, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(-5px)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'rgba(0, 245, 255, 0.3)';
                e.currentTarget.style.boxShadow =
                  '0 0 20px rgba(0, 245, 255, 0.2), inset 0 0 20px rgba(0, 245, 255, 0.05)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                  justifyContent: 'space-between',
                  alignItems: window.innerWidth < 768 ? 'start' : 'start',
                  marginBottom: '1rem',
                  gap: '0.5rem',
                }}
              >
                <div style={{ width: '100%' }}>
                  <h3
                    style={{
                      margin: '0 0 0.5rem 0',
                      background: 'linear-gradient(135deg, #00f5ff 0%, #00ff88 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fontSize: window.innerWidth < 768 ? '1.1rem' : '1.3rem',
                      fontWeight: '700',
                    }}
                  >
                    {editingAccount === account.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && updateAccountName(account.id)}
                          style={{
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '2px solid #00ff88',
                            background: '#1a1a2e',
                            color: 'white',
                            fontSize: '1rem',
                            outline: 'none',
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => updateAccountName(account.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#00ff88',
                            color: '#0f0f23',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                          }}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => {
                            setEditingAccount(null);
                            setEditName('');
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span>{account.name}</span>
                        <button
                          onClick={() => {
                            setEditingAccount(account.id);
                            setEditName(account.name);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: 'transparent',
                            color: '#00ff88',
                            border: '1px solid #00ff88',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    )}
                  </h3>
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '0.4rem 1rem',
                      background: `linear-gradient(135deg, ${getStatusColor(account.status)}40 0%, ${getStatusColor(account.status)}20 100%)`,
                      color: getStatusColor(account.status),
                      border: `2px solid ${getStatusColor(account.status)}`,
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '700',
                      boxShadow: `0 0 15px ${getStatusColor(account.status)}40`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {getStatusText(account.status)}
                  </div>
                </div>
              </div>

              {account.phone && (
                <p
                  style={{
                    margin: '0.5rem 0',
                    color: '#00ff88',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    textShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
                  }}
                >
                  📞 {account.phone}
                </p>
              )}

              {account.qrCode &&
                (account.status === 'qr_ready' ||
                  account.status === 'awaiting_scan' ||
                  account.status === 'reconnecting' ||
                  account.status === 'needs_qr' ||
                  account.status === 'logged_out') && (
                  <div
                    style={{
                      marginTop: '1rem',
                      textAlign: 'center',
                      padding: '1rem',
                      background: 'rgba(255, 165, 0, 0.05)',
                      border: '2px solid rgba(255, 165, 0, 0.3)',
                      borderRadius: '12px',
                      boxShadow: '0 0 20px rgba(255, 165, 0, 0.2)',
                    }}
                  >
                    <p
                      style={{
                        color: '#ffa500',
                        fontSize: '1rem',
                        marginBottom: '1rem',
                        fontWeight: '700',
                        textShadow: '0 0 10px rgba(255, 165, 0, 0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                      }}
                    >
                      📱 Scanează cu WhatsApp
                    </p>
                    <img
                      src={account.qrCode}
                      alt="QR Code"
                      style={{
                        width: window.innerWidth < 768 ? '200px' : '250px',
                        height: window.innerWidth < 768 ? '200px' : '250px',
                        margin: '0 auto',
                        border: '3px solid #ffa500',
                        borderRadius: '12px',
                        padding: '0.5rem',
                        background: 'white',
                        boxShadow: '0 0 30px rgba(255, 165, 0, 0.4)',
                      }}
                    />
                    <p
                      style={{
                        color: '#00ff88',
                        fontSize: '0.75rem',
                        marginTop: '0.75rem',
                        fontWeight: '500',
                      }}
                    >
                      WhatsApp → Settings → Linked Devices → Link a Device
                    </p>

                    {account.pairingCode && (
                      <div
                        style={{
                          marginTop: '1rem',
                          padding: '1.5rem',
                          background:
                            'linear-gradient(135deg, rgba(138, 43, 226, 0.1) 0%, rgba(75, 0, 130, 0.1) 100%)',
                          border: '2px solid rgba(138, 43, 226, 0.4)',
                          borderRadius: '12px',
                          boxShadow: '0 0 20px rgba(138, 43, 226, 0.3)',
                        }}
                      >
                        <p
                          style={{
                            color: '#ba55d3',
                            fontSize: '0.85rem',
                            marginBottom: '0.75rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                          }}
                        >
                          SAU folosește codul:
                        </p>
                        <p
                          style={{
                            color: '#00f5ff',
                            fontSize: window.innerWidth < 768 ? '1.8rem' : '2rem',
                            fontWeight: '800',
                            letterSpacing: '0.3em',
                            margin: '1rem 0',
                            fontFamily: 'monospace',
                            textShadow: '0 0 20px rgba(0, 245, 255, 0.6)',
                            textAlign: 'center',
                          }}
                        >
                          {account.pairingCode}
                        </p>
                        <p
                          style={{
                            color: '#00ff88',
                            fontSize: '0.75rem',
                            marginTop: '0.75rem',
                            fontWeight: '500',
                          }}
                        >
                          WhatsApp → Settings → Linked Devices → Link with phone number
                        </p>
                      </div>
                    )}
                  </div>
                )}

              {account.status === 'connected' && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '1.5rem',
                    background:
                      'linear-gradient(135deg, rgba(0, 255, 136, 0.1) 0%, rgba(0, 245, 255, 0.1) 100%)',
                    border: '2px solid rgba(0, 255, 136, 0.4)',
                    borderRadius: '12px',
                    textAlign: 'center',
                    boxShadow: '0 0 30px rgba(0, 255, 136, 0.2)',
                  }}
                >
                  <p
                    style={{
                      color: '#00ff88',
                      margin: '0 0 1rem 0',
                      fontWeight: '700',
                      fontSize: '1.1rem',
                      textShadow: '0 0 15px rgba(0, 255, 136, 0.6)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                    }}
                  >
                    ✅ Cont Activ
                  </p>
                  <button
                    onClick={() => disconnectAccount(account.id)}
                    style={{
                      padding: '1rem 1.5rem',
                      background: 'linear-gradient(135deg, #ff0080 0%, #ff0040 100%)',
                      color: 'white',
                      border: '2px solid #ff0080',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: '700',
                      fontSize: window.innerWidth < 768 ? '0.95rem' : '1rem',
                      display: 'block',
                      margin: '0 auto',
                      width: '100%',
                      maxWidth: window.innerWidth < 768 ? '100%' : '250px',
                      boxShadow:
                        '0 0 20px rgba(255, 0, 128, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)',
                      transition: 'all 0.3s ease',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                    }}
                    onMouseOver={e => {
                      e.target.style.transform = 'scale(1.05)';
                      e.target.style.boxShadow =
                        '0 0 30px rgba(255, 0, 128, 0.7), inset 0 0 15px rgba(255, 255, 255, 0.3)';
                    }}
                    onMouseOut={e => {
                      e.target.style.transform = 'scale(1)';
                      e.target.style.boxShadow =
                        '0 0 20px rgba(255, 0, 128, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)';
                    }}
                  >
                    🔌 Deconectează
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Adaugă Cont */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background:
                'linear-gradient(135deg, rgba(0, 10, 20, 0.95) 0%, rgba(0, 20, 40, 0.95) 100%)',
              border: '2px solid rgba(0, 245, 255, 0.4)',
              borderRadius: '16px',
              padding: window.innerWidth < 768 ? '1.5rem' : '2rem',
              maxWidth: '450px',
              width: '100%',
              boxShadow: '0 0 40px rgba(0, 245, 255, 0.3), inset 0 0 30px rgba(0, 245, 255, 0.05)',
            }}
          >
            <h3
              style={{
                margin: '0 0 1.5rem 0',
                background: 'linear-gradient(135deg, #00f5ff 0%, #00ff88 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: window.innerWidth < 768 ? '1.3rem' : '1.5rem',
                fontWeight: '800',
                textAlign: 'center',
              }}
            >
              ➕ Adaugă Cont WhatsApp
            </h3>

            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#00f5ff',
                fontSize: '0.875rem',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Nume cont:
            </label>
            <input
              type="text"
              value={newAccountName}
              onChange={e => setNewAccountName(e.target.value)}
              placeholder="Ex: SuperParty Account 1"
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'rgba(0, 245, 255, 0.05)',
                border: '2px solid rgba(0, 245, 255, 0.3)',
                borderRadius: '8px',
                color: '#00f5ff',
                marginBottom: '1rem',
                fontSize: '1rem',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'rgba(0, 245, 255, 0.6)';
                e.target.style.boxShadow = '0 0 15px rgba(0, 245, 255, 0.3)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'rgba(0, 245, 255, 0.3)';
                e.target.style.boxShadow = 'none';
              }}
            />

            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#00ff88',
                fontSize: '0.875rem',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Număr telefon (opțional):
            </label>
            <input
              type="tel"
              value={newAccountPhone}
              onChange={e => setNewAccountPhone(e.target.value)}
              placeholder="Ex: +40712345678"
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'rgba(0, 255, 136, 0.05)',
                border: '2px solid rgba(0, 255, 136, 0.3)',
                borderRadius: '8px',
                color: '#00ff88',
                marginBottom: '0.5rem',
                fontSize: '1rem',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'rgba(0, 255, 136, 0.6)';
                e.target.style.boxShadow = '0 0 15px rgba(0, 255, 136, 0.3)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'rgba(0, 255, 136, 0.3)';
                e.target.style.boxShadow = 'none';
              }}
              onKeyPress={e => e.key === 'Enter' && addAccount()}
            />
            <p
              style={{
                color: '#ba55d3',
                fontSize: '0.75rem',
                marginBottom: '1.5rem',
                marginTop: '0.5rem',
                fontWeight: '500',
              }}
            >
              💡 Dacă introduci numărul, vei primi și un cod de 8 cifre
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                gap: '1rem',
              }}
            >
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewAccountName('');
                  setNewAccountPhone('');
                }}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background:
                    'linear-gradient(135deg, rgba(255, 0, 128, 0.2) 0%, rgba(255, 0, 64, 0.2) 100%)',
                  color: '#ff0080',
                  border: '2px solid rgba(255, 0, 128, 0.4)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '1rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  transition: 'all 0.3s ease',
                }}
                onMouseOver={e => {
                  e.target.style.background =
                    'linear-gradient(135deg, rgba(255, 0, 128, 0.3) 0%, rgba(255, 0, 64, 0.3) 100%)';
                  e.target.style.boxShadow = '0 0 20px rgba(255, 0, 128, 0.4)';
                }}
                onMouseOut={e => {
                  e.target.style.background =
                    'linear-gradient(135deg, rgba(255, 0, 128, 0.2) 0%, rgba(255, 0, 64, 0.2) 100%)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                ✖ Anulează
              </button>
              <button
                onClick={addAccount}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #00f5ff 0%, #00ff88 100%)',
                  color: '#0a0a0a',
                  border: '2px solid #00f5ff',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '800',
                  fontSize: '1rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  boxShadow: '0 0 20px rgba(0, 245, 255, 0.5)',
                  transition: 'all 0.3s ease',
                }}
                onMouseOver={e => {
                  e.target.style.transform = 'scale(1.05)';
                  e.target.style.boxShadow = '0 0 30px rgba(0, 245, 255, 0.7)';
                }}
                onMouseOut={e => {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = '0 0 20px rgba(0, 245, 255, 0.5)';
                }}
              >
                ✓ Adaugă
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppAccounts;
