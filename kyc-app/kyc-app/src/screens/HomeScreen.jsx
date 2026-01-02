import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function HomeScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-redirect to a default screen if needed
    // For now, just show a simple welcome
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#1f2937' }}>
          🎉 SuperParty
        </h1>
        <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '2rem' }}>
          Folosește meniul de jos pentru navigare
        </p>
        <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
          Click pe <strong>➕</strong> din dock pentru a deschide grid-ul cu toate funcțiile
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;
