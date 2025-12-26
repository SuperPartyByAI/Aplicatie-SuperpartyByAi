import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';

function EvenimenteScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [evenimente, setEvenimente] = useState([]);
  const [staffProfiles, setStaffProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Filtre
  const [search, setSearch] = useState('');
  const [dataStart, setDataStart] = useState('');
  const [dataEnd, setDataEnd] = useState('');
  const [locatie, setLocatie] = useState('');
  const [rol, setRol] = useState('');
  const [codCeCodAi, setCodCeCodAi] = useState('');
  const [codCineNoteaza, setCodCineNoteaza] = useState('');
  const [validareCeCodAi, setValidareCeCodAi] = useState('');
  const [validareCineNoteaza, setValidareCineNoteaza] = useState('');

  useEffect(() => {
    loadData();
    
    // OPTIMIZATION: Real-time updates for evenimente
    // onSnapshot listener provides live updates when evenimente change
    // This eliminates the need for manual polling or page refreshes
    const unsubscribe = onSnapshot(collection(db, 'evenimente'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      data.sort((a, b) => {
        const dateA = a.data || a.dataStart || '';
        const dateB = b.data || b.dataStart || '';
        return dateA.localeCompare(dateB);
      });
      
      setEvenimente(data);
    });
    
    // Cleanup listener on unmount to prevent memory leaks
    return () => unsubscribe();
  }, [currentUser]);

  const isValidStaffCode = (cod) => {
    const trimmed = cod.trim().toUpperCase();
    const trainerPattern = /^[A-Z]TRAINER$/;
    const memberPattern = /^[A-Z]([1-9]|[1-4][0-9]|50)$/;
    return trainerPattern.test(trimmed) || memberPattern.test(trimmed);
  };

  const validateCeCodAi = async (cod) => {
    setCodCeCodAi(cod);
    if (!cod.trim()) {
      setValidareCeCodAi('');
      return;
    }

    if (!isValidStaffCode(cod)) {
      setValidareCeCodAi('✗ Format invalid (ex: Atrainer, A1-A50)');
      return;
    }

    try {
      const staffSnapshot = await getDocs(
        query(collection(db, 'staffProfiles'), where('code', '==', cod.trim()))
      );
      
      if (!staffSnapshot.empty) {
        setValidareCeCodAi('✓ Cod acceptat');
      } else {
        setValidareCeCodAi('✗ Cod nu există în sistem');
      }
    } catch (error) {
      console.error('Error validating code:', error);
      setValidareCeCodAi('✗ Eroare validare');
    }
  };

  const validateCineNoteaza = async (cod) => {
    setCodCineNoteaza(cod);
    if (!cod.trim()) {
      setValidareCineNoteaza('');
      return;
    }

    if (!isValidStaffCode(cod)) {
      setValidareCineNoteaza('✗ Format invalid (ex: Btrainer, B1-B50)');
      return;
    }

    try {
      const staffSnapshot = await getDocs(
        query(collection(db, 'staffProfiles'), where('code', '==', cod.trim()))
      );
      
      if (!staffSnapshot.empty) {
        setValidareCineNoteaza('✓ Cod acceptat');
      } else {
        setValidareCineNoteaza('✗ Cod nu există în sistem');
      }
    } catch (error) {
      console.error('Error validating code:', error);
      setValidareCineNoteaza('✗ Eroare validare');
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // OPTIMIZATION: Parallel fetch of evenimente and staff profiles
      // Using Promise.all to fetch both collections simultaneously reduces total load time
      const [evenimenteSnap, staffSnap] = await Promise.all([
        getDocs(collection(db, 'evenimente')),
        getDocs(collection(db, 'staffProfiles'))
      ]);

      const data = evenimenteSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      data.sort((a, b) => {
        const dateA = a.data || a.dataStart || '';
        const dateB = b.data || b.dataStart || '';
        return dateA.localeCompare(dateB);
      });

      // OPTIMIZATION: Pre-build staff profiles map for O(1) lookups
      // Instead of querying staff data for each event (N+1 queries),
      // we create a map once and use it for all events
      const profiles = {};
      staffSnap.docs.forEach(doc => {
        const data = doc.data();
        profiles[data.uid] = data;
      });
      
      setEvenimente(data);
      setStaffProfiles(profiles);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvenimente = evenimente.filter(ev => {
    // Search
    if (search && !ev.nume?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }

    // Dată
    const dataEv = ev.data || ev.dataStart;
    if (dataStart && dataEv < dataStart) return false;
    if (dataEnd && dataEv > dataEnd) return false;

    // Locație
    if (locatie && !ev.locatie?.toLowerCase().includes(locatie.toLowerCase())) {
      return false;
    }

    // Rol
    if (rol && ev.rol !== rol) {
      return false;
    }

    // Filtru "Ce cod ai" - Vezi evenimente cu codul specificat
    // Uses pre-fetched staffProfiles map for O(1) lookups (no additional queries)
    if (codCeCodAi.trim() && validareCeCodAi === '✓ Cod acceptat') {
      const staffAlocat = ev.staffAlocat || [];
      const hasStaffWithCode = staffAlocat.some(uid => {
        const profile = staffProfiles[uid];
        return profile && profile.code === codCeCodAi.trim();
      });
      if (!hasStaffWithCode) {
        return false;
      }
    }

    // Filtru "Cine notează" - Vezi evenimente unde codul specificat face bagajul
    if (codCineNoteaza.trim() && validareCineNoteaza === '✓ Cod acceptat') {
      if (ev.cineNoteaza !== codCineNoteaza.trim()) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Evenimente</h1>
            <p className="page-subtitle">
              {filteredEvenimente.length} evenimente
              {codCeCodAi && validareCeCodAi === '✓ Cod acceptat' && ` cu cod ${codCeCodAi}`}
              {codCineNoteaza && validareCineNoteaza === '✓ Cod acceptat' && ` notate de ${codCineNoteaza}`}
            </p>
          </div>
          <button onClick={() => navigate('/home')} className="btn-secondary">
            ← Înapoi
          </button>
        </div>
      </div>

      {/* Filtre */}
      <div className="filters-bar">
        <input
          type="text"
          placeholder="Caută eveniment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="filter-input"
        />
        
        <input
          type="date"
          placeholder="Data start"
          value={dataStart}
          onChange={(e) => setDataStart(e.target.value)}
          className="filter-input"
        />
        
        <input
          type="date"
          placeholder="Data end"
          value={dataEnd}
          onChange={(e) => setDataEnd(e.target.value)}
          className="filter-input"
        />
        
        <input
          type="text"
          placeholder="Locație..."
          value={locatie}
          onChange={(e) => setLocatie(e.target.value)}
          className="filter-input"
        />
        
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value)}
          className="filter-input"
        >
          <option value="">Toate rolurile</option>
          <option value="ospatar">Ospătar</option>
          <option value="barman">Barman</option>
          <option value="bucatar">Bucătar</option>
          <option value="manager">Manager</option>
        </select>

        <button onClick={loadData} className="btn-refresh">
          🔄 Reîncarcă
        </button>
      </div>

      {/* Filtre speciale cu validare cod */}
      <div className="filters-bar" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <label style={{ color: 'white', fontSize: '0.875rem', fontWeight: '500' }}>
            Ce cod ai
          </label>
          <input
            type="text"
            placeholder="Introdu cod..."
            value={codCeCodAi}
            onChange={(e) => validateCeCodAi(e.target.value)}
            className="filter-input"
          />
          {validareCeCodAi && (
            <span style={{ 
              fontSize: '0.875rem', 
              color: validareCeCodAi.includes('acceptat') ? '#10b981' : '#ef4444' 
            }}>
              {validareCeCodAi}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <label style={{ color: 'white', fontSize: '0.875rem', fontWeight: '500' }}>
            Cine notează
          </label>
          <input
            type="text"
            placeholder="Introdu cod..."
            value={codCineNoteaza}
            onChange={(e) => validateCineNoteaza(e.target.value)}
            className="filter-input"
          />
          {validareCineNoteaza && (
            <span style={{ 
              fontSize: '0.875rem', 
              color: validareCineNoteaza.includes('acceptat') ? '#10b981' : '#ef4444' 
            }}>
              {validareCineNoteaza}
            </span>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Se încarcă evenimentele...</p>
        </div>
      )}

      {/* Lista evenimente */}
      {!loading && (
        <div className="evenimente-list">
          {filteredEvenimente.length === 0 ? (
            <div className="empty-state">
              <p>Nu există evenimente cu aceste filtre.</p>
            </div>
          ) : (
            filteredEvenimente.map(ev => {
              const staffAlocat = ev.staffAlocat || [];
              const nrStaffNecesar = ev.nrStaffNecesar || 0;
              const esteAlocat = staffAlocat.length > 0;
              const esteComplet = staffAlocat.length >= nrStaffNecesar;

              return (
                <div key={ev.id} className="eveniment-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h3>{ev.nume}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {esteAlocat ? (
                        <span className={`badge ${esteComplet ? 'badge-disponibil' : 'badge-warning'}`}>
                          {esteComplet ? '✓ Complet' : '⚠ Parțial'}
                        </span>
                      ) : (
                        <span className="badge badge-indisponibil">✗ Nealocat</span>
                      )}
                      {ev.rol && <span className="badge badge-role">{ev.rol}</span>}
                    </div>
                  </div>

                  <p><strong>Data:</strong> {ev.data || ev.dataStart}</p>
                  <p><strong>Locație:</strong> {ev.locatie}</p>
                  {ev.durataOre && <p><strong>Durată:</strong> {ev.durataOre} ore</p>}
                  
                  {esteAlocat && (
                    <>
                      <p><strong>Staff alocat:</strong> {staffAlocat.length}/{nrStaffNecesar}</p>
                      {ev.bugetStaff && (
                        <p><strong>Buget staff:</strong> {ev.bugetStaff} RON</p>
                      )}
                    </>
                  )}

                  {!esteAlocat && nrStaffNecesar > 0 && (
                    <p><strong>Staff necesar:</strong> {nrStaffNecesar}</p>
                  )}

                  {ev.cineNoteaza && (
                    <p><strong>Cine notează:</strong> {ev.cineNoteaza}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default EvenimenteScreen;
