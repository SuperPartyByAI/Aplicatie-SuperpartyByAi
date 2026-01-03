import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage, callExtractKYCData } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut } from 'firebase/auth';

function KycScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [files, setFiles] = useState({});
  const [data, setData] = useState({
    fullName: '',
    cnp: '',
    gender: '',
    address: '',
    series: '',
    number: '',
    issuedAt: '',
    expiresAt: '',
    iban: '',
  });
  const [pData, setPData] = useState({
    fullName: '',
    cnp: '',
    gender: '',
    address: '',
    series: '',
    number: '',
    issuedAt: '',
    expiresAt: '',
  });
  const [isMinor, setIsMinor] = useState(false);
  const [wantsDriver, setWantsDriver] = useState(false);
  const [aiOk, setAiOk] = useState(false);
  const [pAiOk, setPAiOk] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [contractScrolled, setContractScrolled] = useState(false);
  const [contractRead, setContractRead] = useState(false);
  const [contractUnderstood, setContractUnderstood] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractParentBusy, setExtractParentBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extractInfo, setExtractInfo] = useState('');
  const [extractParentInfo, setExtractParentInfo] = useState('');
  const contractRef = useRef(null);

  useEffect(() => {
    const minor = isMinorFromCnp(data.cnp);
    setIsMinor(minor);
  }, [data.cnp]);

  const isMinorFromCnp = cnp => {
    if (cnp.length < 13) return false;
    const s = cnp[0];
    let prefix = null;
    if (s === '1' || s === '2') prefix = '19';
    if (s === '5' || s === '6') prefix = '20';
    if (!prefix) return false;
    const year = parseInt(prefix + cnp.substring(1, 3));
    const mm = parseInt(cnp.substring(3, 5));
    const dd = parseInt(cnp.substring(5, 7));
    const dob = new Date(year, mm - 1, dd);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age < 18;
  };

  const handleExtract = async () => {
    setExtractBusy(true);
    setExtractInfo('');
    setError('');

    try {
      if (!files.idFront || !files.idBack) {
        throw new Error('Încarcă CI față și CI verso înainte de extragere.');
      }

      setExtractInfo('Se încarcă imaginile...');

      const frontRef = ref(storage, `kyc/${currentUser.uid}/id_front_${Date.now()}.jpg`);
      await uploadBytes(frontRef, files.idFront);
      const frontUrl = await getDownloadURL(frontRef);

      setExtractInfo('Se trimite la AI pentru extragere...');

      const result = await callExtractKYCData({ imageUrl: frontUrl });

      if (result.data.success) {
        const extracted = result.data.data;
        setData({
          ...data,
          fullName: extracted.fullName || '',
          cnp: extracted.cnp || '',
          series: extracted.series || '',
          number: extracted.number || '',
          address: extracted.address || '',
        });

        setExtractInfo('✅ Date extrase cu succes din CI! Verifică și confirmă.');
        setContractOpen(true);
        setContractScrolled(false);
        setContractRead(false);
        setContractUnderstood(false);
      } else {
        throw new Error('Extragerea a eșuat');
      }
    } catch (err) {
      console.error('Extract error:', err);
      setError(err.message || 'Eroare la extragerea datelor. Completează manual.');
      setExtractInfo('');
    } finally {
      setExtractBusy(false);
    }
  };

  const handleExtractParent = async () => {
    setExtractParentBusy(true);
    setExtractParentInfo('');
    setError('');

    try {
      if (!files.parentIdFront || !files.parentIdBack) {
        throw new Error('Încarcă CI părinte față și CI părinte verso înainte de extragere.');
      }

      setExtractParentInfo('Se încarcă imaginile...');

      const frontRef = ref(storage, `kyc/${currentUser.uid}/parent_id_front_${Date.now()}.jpg`);
      await uploadBytes(frontRef, files.parentIdFront);
      const frontUrl = await getDownloadURL(frontRef);

      setExtractParentInfo('Se trimite la AI pentru extragere...');

      const result = await callExtractKYCData({ imageUrl: frontUrl });

      if (result.data.success) {
        const extracted = result.data.data;
        setPData({
          fullName: extracted.fullName || '',
          cnp: extracted.cnp || '',
          series: extracted.series || '',
          number: extracted.number || '',
          address: extracted.address || '',
        });

        setExtractParentInfo('✅ Date părinte extrase cu succes! Verifică și confirmă.');
      } else {
        throw new Error('Extragerea a eșuat');
      }
    } catch (err) {
      console.error('Extract parent error:', err);
      setError(err.message || 'Eroare la extragerea datelor. Completează manual.');
      setExtractParentInfo('');
    } finally {
      setExtractParentBusy(false);
    }
  };

  const handleContractScroll = () => {
    if (contractRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contractRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 10) setContractScrolled(true);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError('');
    try {
      if (!files.idFront || !files.idBack || !files.selfie)
        throw new Error('Încarcă CI și selfie.');
      if (!data.fullName || !data.cnp || !data.iban) throw new Error('Completează câmpurile.');
      if (!aiOk) throw new Error('Confirmă datele.');
      if (
        isMinor &&
        (!files.parentConsent || !files.parentIdFront || !files.parentIdBack || !pAiOk)
      )
        throw new Error('Minor: completează secțiunea părinte.');
      if (!contractScrolled || !contractRead || !contractUnderstood)
        throw new Error('Acceptă contractul.');
      if (wantsDriver && (!files.license || !files.record))
        throw new Error('Șofer: încarcă permis și cazier.');

      const uid = currentUser.uid;

      // Upload fișiere în Storage
      const uploadFile = async (file, path) => {
        const storageRef = ref(storage, `kyc/${uid}/${path}`);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
      };

      const uploads = {
        idFront: await uploadFile(files.idFront, 'idFront.jpg'),
        idBack: await uploadFile(files.idBack, 'idBack.jpg'),
        selfie: await uploadFile(files.selfie, 'selfie.jpg'),
      };

      if (isMinor) {
        uploads.parentConsent = await uploadFile(files.parentConsent, 'parentConsent.jpg');
        uploads.parentIdFront = await uploadFile(files.parentIdFront, 'parentIdFront.jpg');
        uploads.parentIdBack = await uploadFile(files.parentIdBack, 'parentIdBack.jpg');
      }

      if (wantsDriver) {
        uploads.license = await uploadFile(files.license, 'license.jpg');
        uploads.record = await uploadFile(files.record, 'record.jpg');
      }

      // Salvează în Firestore
      await setDoc(doc(db, 'kycSubmissions', uid), {
        uid,
        email: currentUser.email,
        ...data,
        isMinor,
        parent: isMinor ? pData : null,
        wantsDriver,
        uploads,
        contractAccepted: true,
        submittedAt: serverTimestamp(),
      });

      // Update user status
      await setDoc(
        doc(db, 'users', uid),
        {
          status: 'pendingApproval',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-container">
      <div className="card-wide">
        <h1>KYC Onboarding</h1>
        <p>Email: {currentUser?.email}</p>

        <div className="section">
          <h2>Documente Colaborator</h2>
          <FileUpload label="CI Față" onChange={f => setFiles({ ...files, idFront: f })} />
          <FileUpload label="CI Verso" onChange={f => setFiles({ ...files, idBack: f })} />
          <FileUpload label="Selfie" onChange={f => setFiles({ ...files, selfie: f })} />
          <button onClick={handleExtract} disabled={extractBusy || !files.idFront || !files.idBack}>
            {extractBusy ? 'Extrage...' : 'Extrage (AI)'}
          </button>
          {extractInfo && <p className="success">{extractInfo}</p>}
        </div>

        <div className="section">
          <h2>Date Colaborator</h2>
          <input
            placeholder="Nume"
            value={data.fullName}
            onChange={e => setData({ ...data, fullName: e.target.value })}
          />
          <input
            placeholder="CNP"
            value={data.cnp}
            onChange={e => setData({ ...data, cnp: e.target.value })}
          />
          <input
            placeholder="Sex"
            value={data.gender}
            onChange={e => setData({ ...data, gender: e.target.value })}
          />
          <input
            placeholder="Adresă"
            value={data.address}
            onChange={e => setData({ ...data, address: e.target.value })}
          />
          <input
            placeholder="Seria CI"
            value={data.series}
            onChange={e => setData({ ...data, series: e.target.value })}
          />
          <input
            placeholder="Număr CI"
            value={data.number}
            onChange={e => setData({ ...data, number: e.target.value })}
          />
          <input
            placeholder="Emis la"
            value={data.issuedAt}
            onChange={e => setData({ ...data, issuedAt: e.target.value })}
          />
          <input
            placeholder="Expiră la"
            value={data.expiresAt}
            onChange={e => setData({ ...data, expiresAt: e.target.value })}
          />
          <input
            placeholder="IBAN"
            value={data.iban}
            onChange={e => setData({ ...data, iban: e.target.value })}
          />
          <label>
            <input type="radio" checked={aiOk} onChange={() => setAiOk(true)} /> Datele sunt corecte
          </label>
          <label>
            <input type="radio" checked={!aiOk} onChange={() => setAiOk(false)} /> Nu sunt corecte
          </label>
          {isMinor && <div className="alert">Minor detectat! Completează secțiunea părinte.</div>}
        </div>

        {isMinor && (
          <>
            <div className="section">
              <h2>Documente Părinte</h2>
              <FileUpload
                label="Acord parental"
                onChange={f => setFiles({ ...files, parentConsent: f })}
              />
              <FileUpload
                label="CI părinte Față"
                onChange={f => setFiles({ ...files, parentIdFront: f })}
              />
              <FileUpload
                label="CI părinte Verso"
                onChange={f => setFiles({ ...files, parentIdBack: f })}
              />
              <button
                onClick={handleExtractParent}
                disabled={extractParentBusy || !files.parentIdFront || !files.parentIdBack}
              >
                {extractParentBusy ? 'Extrage...' : 'Extrage (AI) Părinte'}
              </button>
              {extractParentInfo && <p className="success">{extractParentInfo}</p>}
            </div>

            <div className="section">
              <h2>Date Părinte</h2>
              <input
                placeholder="Nume părinte"
                value={pData.fullName}
                onChange={e => setPData({ ...pData, fullName: e.target.value })}
              />
              <input
                placeholder="CNP părinte"
                value={pData.cnp}
                onChange={e => setPData({ ...pData, cnp: e.target.value })}
              />
              <input
                placeholder="Sex"
                value={pData.gender}
                onChange={e => setPData({ ...pData, gender: e.target.value })}
              />
              <input
                placeholder="Adresă"
                value={pData.address}
                onChange={e => setPData({ ...pData, address: e.target.value })}
              />
              <label>
                <input type="radio" checked={pAiOk} onChange={() => setPAiOk(true)} /> Datele
                părintelui sunt corecte
              </label>
              <label>
                <input type="radio" checked={!pAiOk} onChange={() => setPAiOk(false)} /> Nu sunt
                corecte
              </label>
            </div>
          </>
        )}

        <div className="section">
          <h2>Opțional – Șofer</h2>
          <label>
            <input
              type="checkbox"
              checked={wantsDriver}
              onChange={e => setWantsDriver(e.target.checked)}
            />{' '}
            Vreau rol șofer
          </label>
          {wantsDriver && (
            <>
              <FileUpload label="Permis" onChange={f => setFiles({ ...files, license: f })} />
              <FileUpload label="Cazier" onChange={f => setFiles({ ...files, record: f })} />
            </>
          )}
        </div>

        <div className="section">
          <h2>Contract</h2>
          <button onClick={() => setContractOpen(!contractOpen)}>
            {contractOpen ? 'Închide' : 'Deschide'} Contract
          </button>
          {contractOpen && (
            <>
              <div className="contract-box" ref={contractRef} onScroll={handleContractScroll}>
                <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>
                  CONTRACT DE COLABORARE
                </h3>

                <p>
                  <strong>Perioada valabilitate:</strong> 15 (00:00) → 14 (23:59) luna următoare
                </p>

                <h4>DATE COLABORATOR:</h4>
                <p>
                  Nume complet: <strong>{data.fullName || '___________'}</strong>
                </p>
                <p>
                  CNP: <strong>{data.cnp || '___________'}</strong>
                </p>
                <p>
                  Adresă: <strong>{data.address || '___________'}</strong>
                </p>
                <p>
                  CI Seria: <strong>{data.series || '___'}</strong>, Număr:{' '}
                  <strong>{data.number || '______'}</strong>
                </p>
                <p>
                  Emis la: <strong>{data.issuedAt || '___________'}</strong>, Expiră la:{' '}
                  <strong>{data.expiresAt || '___________'}</strong>
                </p>
                <p>
                  IBAN: <strong>{data.iban || '___________'}</strong>
                </p>

                <br />
                <h4>ARTICOLUL 1 - OBIECTUL CONTRACTULUI</h4>
                <p>
                  Prezentul contract are ca obiect prestarea de servicii de către COLABORATOR în
                  favoarea BENEFICIARULUI, în cadrul evenimentelor organizate de acesta.
                </p>

                <h4>ARTICOLUL 2 - DURATA CONTRACTULUI</h4>
                <p>
                  Contractul este valabil pentru perioada cuprinsă între data de 15 a lunii curente
                  (ora 00:00) și data de 14 a lunii următoare (ora 23:59).
                </p>
                <p>
                  Contractul poate fi prelungit prin acordul ambelor părți, prin încheierea unui nou
                  contract sau act adițional.
                </p>

                <h4>ARTICOLUL 3 - OBLIGAȚIILE COLABORATORULUI</h4>
                <p>COLABORATORUL se obligă să:</p>
                <ul>
                  <li>
                    Presteze serviciile solicitate cu profesionalism și în conformitate cu
                    instrucțiunile BENEFICIARULUI
                  </li>
                  <li>Respecte programul stabilit pentru fiecare eveniment</li>
                  <li>Poarte echipamentul de protecție și uniforma furnizată (dacă este cazul)</li>
                  <li>Mențină confidențialitatea informațiilor despre evenimente și clienți</li>
                  <li>Respecte normele de conduită și regulamentul intern al BENEFICIARULUI</li>
                  <li>Anunțe cu minimum 24 ore înainte orice imposibilitate de prezentare</li>
                </ul>

                <h4>ARTICOLUL 4 - OBLIGAȚIILE BENEFICIARULUI</h4>
                <p>BENEFICIARUL se obligă să:</p>
                <ul>
                  <li>Asigure condiții adecvate de desfășurare a activității</li>
                  <li>Furnizeze echipamentul necesar (dacă este cazul)</li>
                  <li>Plătească contravaloarea serviciilor prestate conform tarifului convenit</li>
                  <li>
                    Informeze COLABORATORUL despre detaliile fiecărui eveniment cu minimum 48 ore
                    înainte
                  </li>
                  <li>
                    Asigure transportul către și de la locația evenimentului (dacă este specificat)
                  </li>
                </ul>

                <h4>ARTICOLUL 5 - REMUNERAȚIA</h4>
                <p>Remunerația se stabilește pentru fiecare eveniment în parte, în funcție de:</p>
                <ul>
                  <li>Tipul evenimentului</li>
                  <li>Durata evenimentului</li>
                  <li>Complexitatea sarcinilor</li>
                  <li>Locația evenimentului</li>
                </ul>
                <p>
                  Plata se efectuează prin transfer bancar în contul IBAN menționat mai sus, în
                  termen de maximum 15 zile de la finalizarea evenimentului.
                </p>

                <h4>ARTICOLUL 6 - ÎNCETAREA CONTRACTULUI</h4>
                <p>Contractul încetează:</p>
                <ul>
                  <li>La expirarea perioadei de valabilitate</li>
                  <li>Prin acordul părților</li>
                  <li>Prin denunțare unilaterală cu un preaviz de minimum 7 zile</li>
                  <li>În caz de nerespectare gravă a obligațiilor contractuale</li>
                </ul>

                <h4>ARTICOLUL 7 - RĂSPUNDERE</h4>
                <p>COLABORATORUL răspunde pentru:</p>
                <ul>
                  <li>Prejudiciile cauzate din culpa sa în timpul prestării serviciilor</li>
                  <li>Nerespectarea confidențialității</li>
                  <li>Deteriorarea echipamentelor puse la dispoziție</li>
                </ul>

                <h4>ARTICOLUL 8 - FORȚĂ MAJORĂ</h4>
                <p>
                  Niciuna dintre părți nu răspunde pentru neexecutarea obligațiilor contractuale
                  dacă aceasta se datorează unui eveniment de forță majoră.
                </p>
                <p>
                  Partea care invocă forța majoră are obligația de a notifica cealaltă parte în
                  termen de 24 ore de la apariția evenimentului.
                </p>

                <h4>ARTICOLUL 9 - CONFIDENȚIALITATE</h4>
                <p>
                  COLABORATORUL se obligă să păstreze confidențialitatea tuturor informațiilor
                  despre:
                </p>
                <ul>
                  <li>Clienții BENEFICIARULUI</li>
                  <li>Detaliile evenimentelor</li>
                  <li>Metodele de lucru și procedurile interne</li>
                  <li>Orice alte informații considerate confidențiale</li>
                </ul>
                <p>Această obligație rămâne valabilă și după încetarea contractului.</p>

                <h4>ARTICOLUL 10 - PROTECȚIA DATELOR PERSONALE</h4>
                <p>
                  Părțile se obligă să respecte prevederile GDPR (Regulamentul UE 2016/679) privind
                  protecția datelor cu caracter personal.
                </p>
                <p>
                  Datele personale ale COLABORATORULUI vor fi prelucrate exclusiv în scopul
                  executării prezentului contract.
                </p>

                <h4>ARTICOLUL 11 - LITIGII</h4>
                <p>
                  Orice litigiu decurgând din prezentul contract va fi soluționat pe cale amiabilă.
                </p>
                <p>
                  În cazul în care nu se ajunge la o înțelegere, litigiul va fi soluționat de
                  instanțele judecătorești competente.
                </p>

                <h4>ARTICOLUL 12 - DISPOZIȚII FINALE</h4>
                <p>
                  Prezentul contract constituie acordul integral între părți și înlocuiește orice
                  înțelegeri anterioare.
                </p>
                <p>
                  Orice modificare a contractului trebuie făcută în scris și semnată de ambele
                  părți.
                </p>
                <p>
                  Contractul este redactat în limba română în 2 exemplare, câte unul pentru fiecare
                  parte.
                </p>

                {isMinor && (
                  <>
                    <br />
                    <h4 style={{ color: '#f59e0b' }}>CLAUZĂ SPECIALĂ - COLABORATOR MINOR</h4>
                    <p>
                      <strong>
                        În cazul în care COLABORATORUL este minor, prezentul contract se semnează și
                        de părintele sau tutorele legal.
                      </strong>
                    </p>

                    <h4>DATE PĂRINTE/TUTORE:</h4>
                    <p>
                      Nume complet: <strong>{pData.fullName || '___________'}</strong>
                    </p>
                    <p>
                      CNP: <strong>{pData.cnp || '___________'}</strong>
                    </p>
                    <p>
                      Adresă: <strong>{pData.address || '___________'}</strong>
                    </p>
                    <p>
                      CI Seria: <strong>{pData.series || '___'}</strong>, Număr:{' '}
                      <strong>{pData.number || '______'}</strong>
                    </p>
                    <p>
                      Emis la: <strong>{pData.issuedAt || '___________'}</strong>, Expiră la:{' '}
                      <strong>{pData.expiresAt || '___________'}</strong>
                    </p>

                    <p style={{ marginTop: '15px' }}>
                      Subsemnatul/Subsemnata, în calitate de părinte/tutore legal, declar că sunt de
                      acord cu încheierea prezentului contract de colaborare și mă angajez să
                      supraveghez respectarea obligațiilor asumate de minor.
                    </p>
                  </>
                )}

                <br />
                <br />
                <p
                  style={{
                    textAlign: 'center',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#86efac',
                  }}
                >
                  ✓ SFÂRȘIT CONTRACT - AI AJUNS LA FINAL
                </p>
                <p style={{ textAlign: 'center', color: '#94A3B8' }}>
                  Poți acum bifa confirmările de mai jos
                </p>
              </div>
              <div
                style={{
                  padding: '12px',
                  background: contractScrolled ? '#14532d' : '#7c2d12',
                  borderRadius: '8px',
                  marginTop: '12px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: contractScrolled ? '#86efac' : '#fed7aa',
                    fontWeight: 'bold',
                  }}
                >
                  {contractScrolled
                    ? '✅ Ai ajuns la final! Poți bifa confirmările.'
                    : '⚠️ Derulează contractul până jos pentru a continua.'}
                </p>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={contractRead}
                  onChange={e => setContractRead(e.target.checked)}
                  disabled={!contractScrolled}
                />{' '}
                Am citit contractul
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={contractUnderstood}
                  onChange={e => setContractUnderstood(e.target.checked)}
                  disabled={!contractScrolled}
                />{' '}
                Am înțeles contractul
              </label>
            </>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        <button onClick={handleSubmit} disabled={busy}>
          {busy ? 'Trimite...' : 'Trimite KYC'}
        </button>
        <button
          onClick={async () => {
            await signOut(auth);
            navigate('/');
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function FileUpload({ label, onChange }) {
  return (
    <div className="file-upload">
      <label>{label}</label>
      <input type="file" accept="image/*" onChange={e => onChange(e.target.files[0])} />
    </div>
  );
}

export default KycScreen;
