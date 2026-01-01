import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';

function AdminScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.email === 'ursache.andrei1995@gmail.com';

  const [activeTab, setActiveTab] = useState('kyc');
  const [kycPending, setKycPending] = useState([]);
  const [aiConversations, setAiConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKyc, setSelectedKyc] = useState(null);
  const [searchAI, setSearchAI] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [conversationsLimit] = useState(50);

  useEffect(() => {
    // console.log('AdminScreen mounted. User:', currentUser?.email, 'isAdmin:', isAdmin);
    if (!isAdmin) {
      alert('⛔ Acces interzis! Doar administratorul poate accesa această pagină.');
      navigate('/home');
      return;
    }
  }, [isAdmin, navigate, currentUser]);

  useEffect(() => {
    if (!isAdmin) return;

    if (activeTab === 'kyc') {
      loadPendingKyc();

      // OPTIMIZATION: Real-time updates for KYC submissions
      // onSnapshot listener provides instant updates when new KYC submissions arrive
      // This eliminates the need for manual refresh or polling
      const q = query(collection(db, 'users'), where('status', '==', 'pendingApproval'));

      const unsubscribe = onSnapshot(q, () => {
        loadPendingKyc();
      });

      // Cleanup listener on unmount to prevent memory leaks
      return () => unsubscribe();
    } else if (activeTab === 'ai') {
      loadAIConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin]);

  const loadPendingKyc = async () => {
    setLoading(true);
    try {
      // Încarcă useri cu status pendingApproval
      const q = query(collection(db, 'users'), where('status', '==', 'pendingApproval'));

      const snapshot = await getDocs(q);
      const users = [];

      for (const userDoc of snapshot.docs) {
        const userData = userDoc.data();

        // Încarcă și KYC submission
        const kycDoc = await getDocs(
          query(collection(db, 'kycSubmissions'), where('uid', '==', userDoc.id))
        );
        const kycData = kycDoc.docs[0]?.data();

        users.push({
          uid: userDoc.id,
          ...userData,
          kyc: kycData,
        });
      }

      setKycPending(users);
    } catch (error) {
      console.error('Error loading KYC:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async uid => {
    if (!confirm('Aprobi acest KYC?')) return;

    try {
      const code = await generateCode();
      await updateDoc(doc(db, 'users', uid), {
        status: 'approved',
        code: code,
        updatedAt: serverTimestamp(),
      });

      alert(`KYC aprobat! Cod generat: ${code}`);
      loadPendingKyc();
    } catch (error) {
      alert('Eroare: ' + error.message);
    }
  };

  const handleReject = async uid => {
    const reason = prompt('Motiv respingere:');
    if (!reason) return;

    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
      });

      alert('KYC respins!');
      loadPendingKyc();
    } catch (error) {
      alert('Eroare: ' + error.message);
    }
  };

  const loadAIConversations = async () => {
    setLoading(true);
    try {
      // OPTIMIZATION: Pagination for AI conversations
      // Using limit() to fetch only the most recent conversations (default: 50)
      // This reduces initial load time and memory usage for large datasets
      // Users can increase the limit if needed, but default is optimized for performance
      const q = query(
        collection(db, 'aiConversations'),
        orderBy('timestamp', 'desc'),
        limit(conversationsLimit)
      );

      const snapshot = await getDocs(q);

      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));

      setAiConversations(conversations);
    } catch (error) {
      console.error('Error loading AI conversations:', error);
      alert('Eroare la încărcarea conversațiilor: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    const teams = [
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
      'M',
      'N',
      'O',
      'P',
      'Q',
      'R',
      'S',
      'T',
      'U',
      'V',
      'W',
      'X',
      'Y',
      'Z',
    ];

    const existingCodesSnapshot = await getDocs(collection(db, 'users'));
    const existingCodes = new Set(
      existingCodesSnapshot.docs.map(doc => doc.data().code).filter(Boolean)
    );

    for (let attempts = 0; attempts < 100; attempts++) {
      const randomTeam = teams[Math.floor(Math.random() * teams.length)];
      const randomNumber = Math.floor(Math.random() * 50) + 1;
      const code = `${randomTeam}${randomNumber}`;

      if (!existingCodes.has(code)) {
        return code;
      }
    }

    const timestamp = Date.now().toString().slice(-4);
    return `Z${timestamp}`;
  };

  const filteredConversations = aiConversations.filter(conv => {
    if (
      searchAI &&
      !conv.userMessage?.toLowerCase().includes(searchAI.toLowerCase()) &&
      !conv.aiResponse?.toLowerCase().includes(searchAI.toLowerCase())
    ) {
      return false;
    }
    if (
      filterUser &&
      !conv.userEmail?.toLowerCase().includes(filterUser.toLowerCase()) &&
      !conv.userName?.toLowerCase().includes(filterUser.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Group conversations by user for better organization
  // This client-side grouping is efficient since we already have all data loaded
  const conversationsByUser = {};
  filteredConversations.forEach(conv => {
    const key = conv.userId || 'unknown';
    if (!conversationsByUser[key]) {
      conversationsByUser[key] = {
        userId: conv.userId,
        userEmail: conv.userEmail,
        userName: conv.userName,
        conversations: [],
      };
    }
    conversationsByUser[key].conversations.push(conv);
  });

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Admin Panel</h1>
            <p className="page-subtitle">Gestionare KYC și Conversații AI</p>
          </div>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
      </div>

      <div
        style={{
          marginBottom: '2rem',
          display: 'flex',
          gap: '1rem',
          borderBottom: '2px solid #374151',
        }}
      >
        <button
          onClick={() => setActiveTab('kyc')}
          style={{
            padding: '1rem 2rem',
            background: activeTab === 'kyc' ? '#3b82f6' : 'transparent',
            color: 'white',
            border: 'none',
            borderBottom: activeTab === 'kyc' ? '3px solid #3b82f6' : '3px solid transparent',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          📋 Aprobare KYC
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          style={{
            padding: '1rem 2rem',
            background: activeTab === 'ai' ? '#3b82f6' : 'transparent',
            color: 'white',
            border: 'none',
            borderBottom: activeTab === 'ai' ? '3px solid #3b82f6' : '3px solid transparent',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          🤖 Conversații AI
        </button>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Se încarcă...</p>
        </div>
      ) : activeTab === 'kyc' ? (
        <div className="kyc-list">
          {kycPending.length === 0 ? (
            <div className="empty-state">
              <p>✅ Nu există cereri KYC în așteptare</p>
            </div>
          ) : (
            kycPending.map(user => (
              <div key={user.uid} className="kyc-card">
                <div className="kyc-header">
                  <h3>{user.kyc?.fullName || 'N/A'}</h3>
                  <span className="badge-pending">⏳ În așteptare</span>
                </div>

                <div className="kyc-body">
                  <div className="kyc-info-grid">
                    <div className="info-item">
                      <span className="info-label">Email:</span>
                      <span className="info-value">{user.email}</span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">Telefon:</span>
                      <span className="info-value">{user.phone || 'N/A'}</span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">CNP:</span>
                      <span className="info-value">{user.kyc?.cnp || 'N/A'}</span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">Sex:</span>
                      <span className="info-value">{user.kyc?.gender || 'N/A'}</span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">Adresă:</span>
                      <span className="info-value">{user.kyc?.address || 'N/A'}</span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">IBAN:</span>
                      <span className="info-value">{user.kyc?.iban || 'N/A'}</span>
                    </div>

                    {user.kyc?.isMinor && (
                      <div className="info-item full-width">
                        <span className="badge-warning">⚠️ Minor - are părinte/tutore</span>
                      </div>
                    )}

                    {user.kyc?.wantsDriver && (
                      <div className="info-item full-width">
                        <span className="badge-info">🚗 Vrea rol șofer</span>
                      </div>
                    )}
                  </div>

                  <div className="kyc-documents">
                    <h4>Documente:</h4>
                    <div className="documents-grid">
                      {user.kyc?.uploads?.idFront && (
                        <a
                          href={user.kyc.uploads.idFront}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="doc-link"
                        >
                          📄 CI Față
                        </a>
                      )}
                      {user.kyc?.uploads?.idBack && (
                        <a
                          href={user.kyc.uploads.idBack}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="doc-link"
                        >
                          📄 CI Verso
                        </a>
                      )}
                      {user.kyc?.uploads?.selfie && (
                        <a
                          href={user.kyc.uploads.selfie}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="doc-link"
                        >
                          📸 Selfie
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="kyc-footer">
                  <button className="btn-approve" onClick={() => handleApprove(user.uid)}>
                    ✓ Aprobă
                  </button>
                  <button className="btn-reject" onClick={() => handleReject(user.uid)}>
                    ✕ Respinge
                  </button>
                  <button className="btn-details" onClick={() => setSelectedKyc(user)}>
                    👁️ Detalii complete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div>
          <div
            style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: '#1f2937',
              borderRadius: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ margin: 0, color: '#3b82f6' }}>📊 Statistici Conversații</h3>
              <p style={{ margin: '0.5rem 0 0 0', color: '#9ca3af', fontSize: '0.875rem' }}>
                Total conversații:{' '}
                <strong style={{ color: '#10b981' }}>{aiConversations.length}</strong> | Utilizatori
                unici:{' '}
                <strong style={{ color: '#10b981' }}>
                  {Object.keys(conversationsByUser).length}
                </strong>
              </p>
            </div>
            <button
              onClick={loadAIConversations}
              className="btn-refresh"
              style={{ padding: '0.5rem 1rem' }}
            >
              🔄 Reîncarcă
            </button>
          </div>

          <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 Caută în conversații..."
              value={searchAI}
              onChange={e => setSearchAI(e.target.value)}
              className="filter-input"
              style={{ flex: 1, minWidth: '250px' }}
            />
            <input
              type="text"
              placeholder="👤 Filtrează după user..."
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              className="filter-input"
              style={{ flex: 1, minWidth: '250px' }}
            />
          </div>

          {Object.keys(conversationsByUser).length === 0 ? (
            <div className="empty-state">
              <p>📭 Nu există conversații AI înregistrate</p>
              <p style={{ marginTop: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                Conversațiile vor apărea aici după ce utilizatorii vorbesc cu AI-ul.
              </p>
              <div
                style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: '#1f2937',
                  borderRadius: '0.5rem',
                  textAlign: 'left',
                }}
              >
                <p style={{ color: '#d1d5db', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  <strong>Cum funcționează:</strong>
                </p>
                <ul
                  style={{
                    color: '#9ca3af',
                    fontSize: '0.875rem',
                    lineHeight: '1.75',
                    marginLeft: '1.5rem',
                  }}
                >
                  <li>Fiecare conversație cu AI se salvează automat</li>
                  <li>Când user-ul șterge chat-ul, istoricul complet se păstrează</li>
                  <li>Conversațiile șterse sunt marcate cu roșu</li>
                  <li>Poți filtra și căuta în toate conversațiile</li>
                </ul>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {Object.values(conversationsByUser).map(userGroup => (
                <div
                  key={userGroup.userId}
                  style={{
                    background: '#1f2937',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    border: '1px solid #374151',
                  }}
                >
                  <div
                    style={{
                      marginBottom: '1rem',
                      paddingBottom: '1rem',
                      borderBottom: '2px solid #374151',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0, color: '#3b82f6', fontSize: '1.25rem' }}>
                        👤 {userGroup.userName || 'Unknown'}
                      </h3>
                      <p
                        style={{ margin: '0.25rem 0 0 0', color: '#9ca3af', fontSize: '0.875rem' }}
                      >
                        {userGroup.userEmail}
                      </p>
                    </div>
                    <span
                      style={{
                        background: '#374151',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        color: '#d1d5db',
                      }}
                    >
                      {userGroup.conversations.length} conversații
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {userGroup.conversations.map(conv => (
                      <div
                        key={conv.id}
                        style={{
                          background: '#111827',
                          borderRadius: '0.5rem',
                          padding: '1rem',
                          border:
                            conv.type === 'cleared_by_user'
                              ? '2px solid #ef4444'
                              : '1px solid #374151',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            marginBottom: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          <span>
                            🕐{' '}
                            {conv.timestamp
                              ? new Date(conv.timestamp).toLocaleString('ro-RO')
                              : conv.clearedAt
                                ? new Date(conv.clearedAt.toDate()).toLocaleString('ro-RO')
                                : 'N/A'}
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {conv.type === 'cleared_by_user' && (
                              <span
                                style={{
                                  background: '#991b1b',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  color: '#fecaca',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                }}
                              >
                                🗑️ Șters de user
                              </span>
                            )}
                            <span
                              style={{
                                background: '#1f2937',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                              }}
                            >
                              {conv.model || 'gpt-4o-mini'}
                            </span>
                          </div>
                        </div>

                        {conv.type === 'cleared_by_user' && conv.conversationHistory ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div
                              style={{
                                background: '#7c2d12',
                                padding: '0.5rem',
                                borderRadius: '0.25rem',
                                color: '#fed7aa',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                              }}
                            >
                              📜 Istoric complet conversație (
                              {conv.messageCount || conv.conversationHistory.length} mesaje)
                            </div>
                            {conv.conversationHistory.map((msg, idx) => (
                              <div
                                key={idx}
                                style={{
                                  background: msg.role === 'user' ? '#064e3b' : '#1e3a8a',
                                  padding: '0.75rem',
                                  borderRadius: '0.375rem',
                                  borderLeft: `4px solid ${msg.role === 'user' ? '#10b981' : '#3b82f6'}`,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    marginBottom: '0.5rem',
                                    color: msg.role === 'user' ? '#10b981' : '#3b82f6',
                                  }}
                                >
                                  {msg.role === 'user' ? '👤 User' : '🤖 AI'}
                                </div>
                                <div
                                  style={{
                                    color: msg.role === 'user' ? '#d1fae5' : '#bfdbfe',
                                    fontSize: '0.875rem',
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div style={{ marginBottom: '1rem' }}>
                              <div
                                style={{
                                  color: '#10b981',
                                  fontSize: '0.875rem',
                                  fontWeight: '600',
                                  marginBottom: '0.5rem',
                                }}
                              >
                                👤 User:
                              </div>
                              <div
                                style={{
                                  background: '#064e3b',
                                  padding: '0.75rem',
                                  borderRadius: '0.375rem',
                                  color: '#d1fae5',
                                  fontSize: '0.875rem',
                                  lineHeight: '1.5',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {conv.userMessage || 'N/A'}
                              </div>
                            </div>

                            <div>
                              <div
                                style={{
                                  color: '#3b82f6',
                                  fontSize: '0.875rem',
                                  fontWeight: '600',
                                  marginBottom: '0.5rem',
                                }}
                              >
                                🤖 AI:
                              </div>
                              <div
                                style={{
                                  background: '#1e3a8a',
                                  padding: '0.75rem',
                                  borderRadius: '0.375rem',
                                  color: '#bfdbfe',
                                  fontSize: '0.875rem',
                                  lineHeight: '1.5',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {conv.aiResponse || 'N/A'}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedKyc && (
        <div className="modal-overlay" onClick={() => setSelectedKyc(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalii KYC - {selectedKyc.kyc?.fullName}</h2>
              <button className="modal-close" onClick={() => setSelectedKyc(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <pre>{JSON.stringify(selectedKyc, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminScreen;
