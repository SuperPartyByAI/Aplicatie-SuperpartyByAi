import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';

function SettingsScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [loading] = useState(false);

  const isAdmin = currentUser?.email === 'ursache.andrei1995@gmail.com';

  useEffect(() => {
    if (!isAdmin) {
      navigate('/home');
      return;
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>⚙️ Setări Admin</h1>
            <p className="page-subtitle">Configurare sistem</p>
          </div>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Se încarcă setările...</p>
        </div>
      ) : (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ padding: '2rem', background: '#1f2937', borderRadius: '0.5rem', marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>
              🔑 OpenAI API Key
            </h3>
            <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              API Key-ul este stocat securizat în Firebase Functions Secrets și nu poate fi accesat din aplicație.
            </p>
            
            <div style={{ padding: '1rem', background: '#065f46', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ color: 'white', fontSize: '0.875rem' }}>
                ✓ API Key configurat securizat. Toți userii autentificați pot folosi AI.
              </p>
            </div>

            <div style={{ padding: '1rem', background: '#1e3a8a', borderRadius: '0.5rem' }}>
              <p style={{ color: 'white', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <strong>Pentru a actualiza API Key-ul:</strong>
              </p>
              <ol style={{ color: '#bfdbfe', fontSize: '0.875rem', marginLeft: '1.5rem', lineHeight: '1.75' }}>
                <li>Rulează: <code style={{ background: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>firebase functions:secrets:set OPENAI_API_KEY</code></li>
                <li>Introdu noul API key când ești solicitat</li>
                <li>Redeploy functions: <code style={{ background: '#1e40af', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>firebase deploy --only functions</code></li>
              </ol>
            </div>
          </div>

          <div style={{ padding: '2rem', background: '#1f2937', borderRadius: '0.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>
              ℹ️ Informații Securitate
            </h3>
            <ul style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: '1.75' }}>
              <li>API Key-ul este stocat în Firebase Functions Secrets (Google Cloud Secret Manager)</li>
              <li>Key-ul NU este accesibil din client sau Firestore</li>
              <li>Toate request-urile AI trec prin Cloud Functions autentificate</li>
              <li>Rate limiting: 10 request-uri/minut per utilizator</li>
              <li>Timeout: 30 secunde per request</li>
              <li>Key-ul este folosit pentru:
                <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                  <li>Chat AI (GPT-4o-mini)</li>
                  <li>Extragere date din documente (viitor)</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsScreen;
