import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

function SoferiScreen() {
  const navigate = useNavigate();
  const [soferi, setSoferi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSofer, setEditingSofer] = useState(null);

  // Form state
  const [nume, setNume] = useState('');
  const [telefon, setTelefon] = useState('');
  const [email, setEmail] = useState('');
  const [tipVehicul, setTipVehicul] = useState('');
  const [numarInmatriculare, setNumarInmatriculare] = useState('');
  const [capacitate, setCapacitate] = useState('');
  const [status, setStatus] = useState('activ');
  const [notite, setNotite] = useState('');

  useEffect(() => {
    loadSoferi();
  }, []);

  const loadSoferi = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'soferi'));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSoferi(data);
    } catch (error) {
      console.error('Error loading soferi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();

    if (!nume || !telefon) {
      alert('Completează numele și telefonul!');
      return;
    }

    try {
      const soferData = {
        nume,
        telefon,
        email,
        tipVehicul,
        numarInmatriculare,
        capacitate: capacitate ? parseInt(capacitate) : null,
        status,
        notite,
        updatedAt: serverTimestamp(),
      };

      if (editingSofer) {
        await updateDoc(doc(db, 'soferi', editingSofer.id), soferData);
        alert('Șofer actualizat!');
      } else {
        await addDoc(collection(db, 'soferi'), {
          ...soferData,
          createdAt: serverTimestamp(),
        });
        alert('Șofer adăugat!');
      }

      setShowModal(false);
      resetForm();
      loadSoferi();
    } catch (error) {
      console.error('Error saving sofer:', error);
      alert('Eroare la salvare!');
    }
  };

  const handleEdit = sofer => {
    setEditingSofer(sofer);
    setNume(sofer.nume);
    setTelefon(sofer.telefon);
    setEmail(sofer.email || '');
    setTipVehicul(sofer.tipVehicul || '');
    setNumarInmatriculare(sofer.numarInmatriculare || '');
    setCapacitate(sofer.capacitate || '');
    setStatus(sofer.status || 'activ');
    setNotite(sofer.notite || '');
    setShowModal(true);
  };

  const handleDelete = async id => {
    if (!confirm('Ștergi acest șofer?')) return;

    try {
      await deleteDoc(doc(db, 'soferi', id));
      alert('Șofer șters!');
      loadSoferi();
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Eroare la ștergere!');
    }
  };

  const resetForm = () => {
    setEditingSofer(null);
    setNume('');
    setTelefon('');
    setEmail('');
    setTipVehicul('');
    setNumarInmatriculare('');
    setCapacitate('');
    setStatus('activ');
    setNotite('');
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const getStatusBadge = status => {
    switch (status) {
      case 'activ':
        return 'badge-disponibil';
      case 'inactiv':
        return 'badge-indisponibil';
      case 'concediu':
        return 'badge-warning';
      default:
        return 'badge-disponibil';
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Management Șoferi</h1>
            <p className="page-subtitle">Gestionează șoferii și vehiculele pentru transport</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => navigate('/home')} className="btn-secondary">
              ← Înapoi
            </button>
            <button onClick={openAddModal} className="btn-refresh">
              + Adaugă Șofer
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="soferi-stats">
        <div className="stat-card">
          <h3>Total Șoferi</h3>
          <p>{soferi.length}</p>
        </div>
        <div className="stat-card">
          <h3>Activi</h3>
          <p>{soferi.filter(s => s.status === 'activ').length}</p>
        </div>
        <div className="stat-card">
          <h3>Inactivi</h3>
          <p>{soferi.filter(s => s.status === 'inactiv').length}</p>
        </div>
        <div className="stat-card">
          <h3>În Concediu</h3>
          <p>{soferi.filter(s => s.status === 'concediu').length}</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Se încarcă șoferii...</p>
        </div>
      )}

      {/* Lista șoferi */}
      {!loading && (
        <div className="soferi-list">
          {soferi.length === 0 ? (
            <div className="empty-state">
              <p>Nu există șoferi adăugați încă.</p>
              <button onClick={openAddModal} className="btn-refresh">
                Adaugă Primul Șofer
              </button>
            </div>
          ) : (
            soferi.map(sofer => (
              <div key={sofer.id} className="sofer-card">
                <div className="sofer-header">
                  <div>
                    <h3>{sofer.nume}</h3>
                    <span className={`badge ${getStatusBadge(sofer.status)}`}>
                      {sofer.status === 'activ' && '✓ Activ'}
                      {sofer.status === 'inactiv' && '✗ Inactiv'}
                      {sofer.status === 'concediu' && '🏖️ Concediu'}
                    </span>
                  </div>
                  <div className="sofer-actions">
                    <button onClick={() => handleEdit(sofer)} className="btn-edit">
                      ✏️ Editează
                    </button>
                    <button onClick={() => handleDelete(sofer.id)} className="btn-delete-small">
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="sofer-body">
                  <p>
                    <strong>📞 Telefon:</strong> {sofer.telefon}
                  </p>
                  {sofer.email && (
                    <p>
                      <strong>📧 Email:</strong> {sofer.email}
                    </p>
                  )}
                  {sofer.tipVehicul && (
                    <p>
                      <strong>🚗 Vehicul:</strong> {sofer.tipVehicul}
                    </p>
                  )}
                  {sofer.numarInmatriculare && (
                    <p>
                      <strong>🔢 Nr. Înmatriculare:</strong> {sofer.numarInmatriculare}
                    </p>
                  )}
                  {sofer.capacitate && (
                    <p>
                      <strong>👥 Capacitate:</strong> {sofer.capacitate} persoane
                    </p>
                  )}
                  {sofer.notite && (
                    <p>
                      <strong>📝 Notițe:</strong> {sofer.notite}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Adăugare/Editare */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSofer ? 'Editează Șofer' : 'Adaugă Șofer'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">
                ×
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Nume Complet *</label>
                  <input
                    type="text"
                    value={nume}
                    onChange={e => setNume(e.target.value)}
                    className="filter-input"
                    placeholder="Ex: Ion Popescu"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Telefon *</label>
                    <input
                      type="tel"
                      value={telefon}
                      onChange={e => setTelefon(e.target.value)}
                      className="filter-input"
                      placeholder="0712345678"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="filter-input"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tip Vehicul</label>
                    <input
                      type="text"
                      value={tipVehicul}
                      onChange={e => setTipVehicul(e.target.value)}
                      className="filter-input"
                      placeholder="Ex: Microbuz Mercedes"
                    />
                  </div>
                  <div className="form-group">
                    <label>Nr. Înmatriculare</label>
                    <input
                      type="text"
                      value={numarInmatriculare}
                      onChange={e => setNumarInmatriculare(e.target.value)}
                      className="filter-input"
                      placeholder="B-123-ABC"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Capacitate (persoane)</label>
                    <input
                      type="number"
                      value={capacitate}
                      onChange={e => setCapacitate(e.target.value)}
                      className="filter-input"
                      placeholder="8"
                      min="1"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      className="filter-input"
                    >
                      <option value="activ">✓ Activ</option>
                      <option value="inactiv">✗ Inactiv</option>
                      <option value="concediu">🏖️ Concediu</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notițe</label>
                  <textarea
                    value={notite}
                    onChange={e => setNotite(e.target.value)}
                    className="filter-input"
                    rows="3"
                    placeholder="Informații adiționale..."
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-secondary"
                  >
                    Anulează
                  </button>
                  <button type="submit" className="btn-refresh">
                    {editingSofer ? 'Actualizează' : 'Adaugă'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SoferiScreen;
