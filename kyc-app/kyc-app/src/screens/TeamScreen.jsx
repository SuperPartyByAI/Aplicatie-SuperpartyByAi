import { useNavigate } from 'react-router-dom';

export default function TeamScreen() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '8px 16px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ← Înapoi
        </button>
      </div>

      <h1>Echipă</h1>
      <p>Pagină placeholder pentru gestionarea echipei.</p>

      <div style={{ marginTop: '40px' }}>
        <h2>Funcționalități viitoare:</h2>
        <ul>
          <li>Vizualizare membri echipă</li>
          <li>Adăugare membri noi</li>
          <li>Editare roluri și permisiuni</li>
          <li>Statistici echipă</li>
        </ul>
      </div>
    </div>
  );
}
