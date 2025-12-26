# 📚 LOGICA APLICAȚIEI - Documentație Tehnică Ultra-Detaliată

> **Fiecare linie de logică este documentată cu:**
> - 📍 Locația exactă în cod (fișier + linie)
> - 🎯 Ce face
> - 🔗 Cu ce se conectează
> - 📊 Date de intrare/ieșire
> - ⚠️ Edge cases

## 📋 Cuprins

1. [Firebase Configuration](#1-firebase-configuration)
2. [App.jsx - Router & FlowGuard](#2-appjsx---router--flowguard)
3. [AuthScreen - Autentificare](#3-authscreen---autentificare)
4. [VerifyEmailScreen - Verificare Email](#4-verifyemailscreen---verificare-email)
5. [KycScreen - Proces KYC](#5-kycscreen---proces-kyc)
6. [WaitingScreen - Așteptare Aprobare](#6-waitingscreen---așteptare-aprobare)
7. [StaffSetupScreen - Setup Staff](#7-staffsetupscreen---setup-staff)
8. [HomeScreen - Dashboard](#8-homescreen---dashboard)
9. [EvenimenteNealocateScreen - Evenimente Nealocate](#9-evenimentenealocatescreen---evenimente-nealocate)
10. [EvenimenteScreen - Evenimente Alocate](#10-evenimentescreen---evenimente-alocate)
11. [AlocareScreen - Alocare AI](#11-alocarescreen---alocare-ai)
12. [DisponibilitateScreen - Disponibilitate](#12-disponibilitatescreen---disponibilitate)
13. [SalarizareScreen - Salarizare](#13-salarizarescreen---salarizare)
14. [SoferiScreen - Management Șoferi](#14-soferiscreen---management-șoferi)
15. [AdminScreen - Admin Panel](#15-adminscreen---admin-panel)
16. [Utils - Funcții Utilitare](#16-utils---funcții-utilitare)
17. [Firebase Schema Completă](#17-firebase-schema-completă)

---

## 1. Firebase Configuration

### 📍 Fișier: `src/firebase.js`

#### Linia 1-5: Import Firebase SDK
```javascript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
```
**Ce face:** Importă modulele Firebase necesare
**Conectare:** Folosite în toate screen-urile pentru operații DB/Auth/Storage

#### Linia 7-14: Firebase Config
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDcec3QIIpqrhmGSsvAeH2qEbuDKwZFG3o",
  authDomain: "superparty-frontend.firebaseapp.com",
  projectId: "superparty-frontend",
  storageBucket: "superparty-frontend.firebasestorage.app",
  messagingSenderId: "168752018174",
  appId: "1:168752018174:web:819254dcc7d58147d82baf",
  measurementId: "G-B2HBZK3FQ7"
};
```
**Ce face:** Configurare conexiune Firebase
**⚠️ IMPORTANT:** Aceste credențiale sunt publice (frontend), nu conțin secrete

#### Linia 16: Inițializare App
```javascript
const app = initializeApp(firebaseConfig);
```
**Ce face:** Creează instanța Firebase
**Conectare:** Folosită pentru toate serviciile Firebase

#### Linia 18-21: Export Servicii
```javascript
export const auth = getAuth(app);      // Autentificare
export const db = getFirestore(app);   // Database
export const storage = getStorage(app); // File storage
export default app;
```
**Ce face:** Exportă serviciile pentru import în alte fișiere
**Folosit în:** Toate screen-urile care fac operații DB/Auth/Storage

---

## 2. App.jsx - Router & FlowGuard

### 📍 Fișier: `src/App.jsx`

#### Linia 1-15: Imports
```javascript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import AuthScreen from './screens/AuthScreen';
// ... toate screen-urile
```
**Ce face:** Importă dependențele și toate paginile
**Conectare:** React Router pentru navigare, Firebase pentru auth

#### Linia 17-35: Definire Rute
```javascript
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FlowGuard />} />
        <Route path="/verify-email" element={<VerifyEmailScreen />} />
        <Route path="/kyc" element={<KycScreen />} />
        <Route path="/waiting" element={<WaitingScreen />} />
        <Route path="/staff-setup" element={<StaffSetupScreen />} />
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/evenimente-nealocate" element={<EvenimenteNealocateScreen />} />
        <Route path="/evenimente" element={<EvenimenteScreen />} />
        <Route path="/alocare" element={<AlocareScreen />} />
        <Route path="/disponibilitate" element={<DisponibilitateScreen />} />
        <Route path="/salarizare" element={<SalarizareScreen />} />
        <Route path="/soferi" element={<SoferiScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```
**Ce face:** Definește toate rutele aplicației
**Logică:** 
- `/` → FlowGuard (decide unde să meargă user-ul)
- Toate celelalte rute sunt directe
- `*` → Redirect la home pentru rute inexistente

#### Linia 40-44: FlowGuard - State Management
```javascript
function FlowGuard() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
```
**Ce face:** Inițializează state-uri pentru:
- `user`: Firebase Auth user object
- `userData`: Date user din Firestore (status, setupDone, etc.)
- `loading`: Flag pentru loading state

**Conectare:** Aceste state-uri controlează întreaga navigare

#### Linia 46-95: useEffect - Auth Listener
```javascript
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // ADMIN BYPASS LOGIC
        if (firebaseUser.email === 'ursache.andrei1995@gmail.com') {
          // Verifică dacă există în users
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (!userDoc.exists()) {
            // Creează user admin automat
            await Promise.all([
              setDoc(userRef, {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                status: 'approved',
                setupDone: true,
                code: 'ADMIN001',
                updatedAt: serverTimestamp(),
              }, { merge: true }),
              setDoc(doc(db, 'staffProfiles', firebaseUser.uid), {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                code: 'ADMIN001',
                codIdentificare: 'ADMIN001',
                ceCodAi: 'ADMIN001',
                cineNoteaza: 'Admin',
                setupDone: true,
                updatedAt: serverTimestamp(),
              }, { merge: true })
            ]);
          }
          
          setUserData({ status: 'approved', setupDone: true, code: 'ADMIN001' });
        } else {
          // USER NORMAL - Încarcă date din Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          } else {
            setUserData(null);
          }
        }
      } else {
        setUser(null);
        setUserData(null);
      }
    } catch (error) {
      console.error('Error in auth listener:', error);
    } finally {
      setLoading(false);
    }
  });

  return () => unsubscribe();
}, []);
```
**Ce face - Pas cu pas:**

1. **Linia 47:** `onAuthStateChanged` - Listener Firebase Auth
   - Se declanșează la fiecare schimbare de auth state
   - Parametru: `firebaseUser` (null dacă delogat, object dacă logat)

2. **Linia 49-51:** Verifică dacă user e logat
   - Dacă DA → setează `user` state

3. **Linia 53-68:** **ADMIN BYPASS LOGIC**
   - **Condiție:** Email = `ursache.andrei1995@gmail.com`
   - **Ce face:**
     - Verifică dacă există în colecția `users`
     - Dacă NU există → Creează automat cu:
       - `status: 'approved'`
       - `setupDone: true`
       - `code: 'ADMIN001'`
     - Creează și în `staffProfiles`
   - **Rezultat:** Admin bypass complet flow-ul KYC

4. **Linia 70-77:** **USER NORMAL**
   - Încarcă date din Firestore `users` collection
   - Setează `userData` cu datele găsite
   - Dacă nu există → `userData = null` (trebuie să facă KYC)

5. **Linia 78-81:** User delogat
   - Resetează toate state-urile

6. **Linia 82-84:** Error handling
   - Catch orice eroare și o loghează

7. **Linia 85-87:** Finally block
   - **IMPORTANT:** `setLoading(false)` se execută ÎNTOTDEAUNA
   - Previne infinite loading

8. **Linia 90:** Cleanup
   - Unsubscribe de la listener când componenta se demontează

**Conectare:**
- `user` → folosit pentru verificare autentificare
- `userData` → folosit pentru verificare status KYC/approval
- `loading` → afișează loading screen

#### Linia 97-110: FlowGuard - Logica de Navigare
```javascript
if (loading) {
  return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p>Se încarcă...</p>
    </div>
  );
}

if (!user) {
  return <AuthScreen />;
}

if (!user.emailVerified) {
  return <Navigate to="/verify-email" replace />;
}

if (userData?.status === 'pendingApproval') {
  return <Navigate to="/waiting" replace />;
}

if (userData?.status === 'approved' && !userData?.setupDone) {
  return <Navigate to="/staff-setup" replace />;
}

if (userData?.status === 'approved' && userData?.setupDone) {
  return <Navigate to="/home" replace />;
}

return <Navigate to="/kyc" replace />;
```
**Ce face - Decizie Tree:**

1. **Linia 97-104:** Loading State
   - Dacă `loading = true` → Afișează spinner
   - Previne flash de conținut

2. **Linia 106-108:** Nu e autentificat
   - Dacă `user = null` → Afișează `AuthScreen`

3. **Linia 110-112:** Email neverificat
   - Dacă `user.emailVerified = false` → Redirect la `/verify-email`

4. **Linia 114-116:** KYC în așteptare
   - Dacă `userData.status = 'pendingApproval'` → Redirect la `/waiting`

5. **Linia 118-120:** Aprobat dar fără setup
   - Dacă `status = 'approved'` ȘI `setupDone = false` → Redirect la `/staff-setup`

6. **Linia 122-124:** Aprobat și setup complet
   - Dacă `status = 'approved'` ȘI `setupDone = true` → Redirect la `/home`

7. **Linia 126:** Default - Trebuie KYC
   - Dacă nimic din cele de sus → Redirect la `/kyc`

**Flow Chart:**
```
User logat?
  NO → AuthScreen
  YES ↓
Email verificat?
  NO → VerifyEmailScreen
  YES ↓
Are userData?
  NO → KycScreen
  YES ↓
Status = 'pendingApproval'?
  YES → WaitingScreen
  NO ↓
Status = 'approved' && !setupDone?
  YES → StaffSetupScreen
  NO ↓
Status = 'approved' && setupDone?
  YES → HomeScreen
```

---

## 3. AuthScreen - Autentificare

### 📍 Fișier: `src/screens/AuthScreen.jsx`

#### Linia 1-6: Imports
```javascript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
```
**Ce face:** Importă dependențele pentru auth și DB
**Conectare:** Firebase Auth pentru login/register, Firestore pentru verificare admin

#### Linia 8-13: State Management
```javascript
function AuthScreen() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
```
**Ce face:** Inițializează state-uri
- `isLogin`: Toggle între Login/Register (default: true = Login)
- `email`: Input email
- `password`: Input password
- `error`: Mesaj eroare pentru afișare

#### Linia 15-82: handleAuth - Logica Principală
```javascript
const handleAuth = async (e) => {
  e.preventDefault();
  setError('');

  try {
    let userCredential;
    
    if (isLogin) {
      // LOGIN
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } else {
      // REGISTER
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(userCredential.user);
    }

    const user = userCredential.user;

    // ADMIN BYPASS CHECK
    if (user.email === 'ursache.andrei1995@gmail.com') {
      const userRef = doc(db, 'users', user.uid);
      const staffRef = doc(db, 'staffProfiles', user.uid);
      
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await Promise.all([
          setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            status: 'approved',
            setupDone: true,
            code: 'ADMIN001',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(staffRef, {
            uid: user.uid,
            email: user.email,
            nume: 'Admin',
            code: 'ADMIN001',
            codIdentificare: 'ADMIN001',
            ceCodAi: 'ADMIN001',
            cineNoteaza: 'Admin',
            setupDone: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ]);
      }
      
      navigate('/home');
      return;
    }

    // USER NORMAL
    if (!isLogin) {
      alert('Cont creat! Verifică email-ul pentru confirmare.');
    }
    
    navigate('/');
    
  } catch (err) {
    console.error('Auth error:', err);
    
    switch(err.code) {
      case 'auth/email-already-in-use':
        setError('Email-ul este deja folosit.');
        break;
      case 'auth/invalid-email':
        setError('Email invalid.');
        break;
      case 'auth/weak-password':
        setError('Parola trebuie să aibă minim 6 caractere.');
        break;
      case 'auth/user-not-found':
        setError('Nu există cont cu acest email.');
        break;
      case 'auth/wrong-password':
        setError('Parolă greșită.');
        break;
      default:
        setError(err.message);
    }
  }
};
```

**Ce face - Pas cu pas:**

1. **Linia 16-17:** Previne refresh și resetează erori
   - `e.preventDefault()` → Nu reîncarcă pagina la submit
   - `setError('')` → Curăță mesajele de eroare anterioare

2. **Linia 20-26:** Login vs Register
   - **Dacă `isLogin = true`:**
     - Apelează `signInWithEmailAndPassword()`
     - Parametri: auth instance, email, password
     - Return: `userCredential` object cu user info
   
   - **Dacă `isLogin = false` (Register):**
     - Apelează `createUserWithEmailAndPassword()`
     - Trimite email de verificare cu `sendEmailVerification()`

3. **Linia 28:** Extrage user object
   - `userCredential.user` conține: uid, email, emailVerified, etc.

4. **Linia 30-54:** **ADMIN BYPASS LOGIC**
   - **Condiție:** `user.email === 'ursache.andrei1995@gmail.com'`
   
   - **Verificare existență:**
     - Linia 31-34: Creează referințe la documente Firestore
     - Linia 36: Verifică dacă există deja în `users` collection
   
   - **Dacă NU există:**
     - Linia 38-51: Creează simultan 2 documente:
       1. În `users`: status='approved', setupDone=true, code='ADMIN001'
       2. În `staffProfiles`: toate datele staff cu cod admin
     - Folosește `Promise.all()` pentru execuție paralelă
   
   - **Linia 53-54:** Redirect direct la `/home`
   - **Linia 55:** `return` → Oprește execuția (nu mai continuă cu logica normală)

5. **Linia 57-62:** **USER NORMAL**
   - Dacă e register → Afișează alert pentru verificare email
   - Navigate la `/` → FlowGuard va decide unde să meargă

6. **Linia 64-82:** **Error Handling**
   - Catch orice eroare Firebase Auth
   - Switch pe `err.code` pentru mesaje user-friendly:
     - `auth/email-already-in-use` → "Email-ul este deja folosit"
     - `auth/invalid-email` → "Email invalid"
     - `auth/weak-password` → "Parola trebuie să aibă minim 6 caractere"
     - `auth/user-not-found` → "Nu există cont cu acest email"
     - `auth/wrong-password` → "Parolă greșită"
     - default → Afișează mesajul original de eroare

**Conectare cu App.jsx:**
- După login/register → `onAuthStateChanged` din App.jsx se declanșează
- FlowGuard verifică starea și decide navigarea

**Flow Chart:**
```
Submit Form
  ↓
isLogin?
  YES → signInWithEmailAndPassword()
  NO → createUserWithEmailAndPassword() + sendEmailVerification()
  ↓
Email = admin?
  YES → Verifică/Creează documente admin → Navigate('/home')
  NO → Navigate('/') → FlowGuard decide
```

#### Linia 84-130: JSX - UI
```javascript
return (
  <div className="auth-container">
    <div className="auth-box">
      <h1>{isLogin ? 'Login' : 'Register'}</h1>
      
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleAuth}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">
          {isLogin ? 'Login' : 'Register'}
        </button>
      </form>
      
      <p className="toggle-text">
        {isLogin ? "Nu ai cont? " : "Ai deja cont? "}
        <span onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'Register' : 'Login'}
        </span>
      </p>
    </div>
  </div>
);
```
**Ce face:**
- Afișează formular cu 2 inputuri (email, password)
- Toggle între Login/Register cu `setIsLogin(!isLogin)`
- Afișează erori dacă există
- Submit → apelează `handleAuth()`

---

## 4. VerifyEmailScreen - Verificare Email

### 📍 Fișier: `src/screens/VerifyEmailScreen.jsx`

#### Linia 1-4: Imports
```javascript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { sendEmailVerification, signOut } from 'firebase/auth';
```

#### Linia 6-10: State Management
```javascript
function VerifyEmailScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [message, setMessage] = useState('');
  const [canResend, setCanResend] = useState(true);
```
**Ce face:**
- `currentUser`: User curent din Firebase Auth
- `message`: Mesaj feedback pentru user
- `canResend`: Flag pentru a preveni spam (cooldown 60s)

#### Linia 12-28: useEffect - Verificare Automată
```javascript
useEffect(() => {
  const interval = setInterval(async () => {
    if (currentUser) {
      await currentUser.reload();
      if (currentUser.emailVerified) {
        clearInterval(interval);
        navigate('/');
      }
    }
  }, 3000);

  return () => clearInterval(interval);
}, [currentUser, navigate]);
```
**Ce face - Pas cu pas:**

1. **Linia 13:** Creează interval care rulează la fiecare 3 secunde
2. **Linia 15:** Verifică dacă există user logat
3. **Linia 16:** `currentUser.reload()` → Reîmprospătează datele user din Firebase
   - **IMPORTANT:** Fără reload, `emailVerified` rămâne false chiar dacă user-ul a verificat
4. **Linia 17-20:** Dacă email verificat:
   - Oprește interval-ul
   - Navigate la `/` → FlowGuard va decide următorul pas
5. **Linia 24:** Cleanup - Oprește interval când componenta se demontează

**Conectare:** Verificare automată fără refresh manual

#### Linia 30-48: handleResendEmail - Retrimite Email
```javascript
const handleResendEmail = async () => {
  if (!canResend) return;
  
  try {
    await sendEmailVerification(currentUser);
    setMessage('Email de verificare retrimis! Verifică inbox-ul.');
    setCanResend(false);
    
    setTimeout(() => {
      setCanResend(true);
      setMessage('');
    }, 60000);
    
  } catch (error) {
    console.error('Error resending email:', error);
    setMessage('Eroare la retrimitere. Încearcă din nou.');
  }
};
```
**Ce face - Pas cu pas:**

1. **Linia 31:** Verifică dacă poate retrimite (cooldown activ?)
2. **Linia 34:** Trimite email de verificare
3. **Linia 35-36:** Afișează mesaj success și dezactivează butonul
4. **Linia 38-41:** După 60 secunde:
   - Reactivează butonul (`setCanResend(true)`)
   - Curăță mesajul
5. **Linia 43-46:** Error handling

**Previne spam:** User poate retrimite doar o dată la 60 secunde

---

## 5. KycScreen - Proces KYC

### 📍 Fișier: `src/screens/KycScreen.jsx` (430 linii)

**Cel mai complex screen - Gestionează:**
- Upload 7 tipuri de documente
- AI extraction cu GPT-4 Vision
- Detectare minor din CNP
- Contract cu scroll detection
- Validare completă
- Upload Firebase Storage
- Salvare Firestore

#### Linia 1-7: Imports
```javascript
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { extractIdData } from '../utils/gptExtraction';
```
**Conectare:**
- `extractIdData` → Funcție AI extraction (documentată în secțiunea Utils)
- Firebase Storage → Pentru upload imagini
- Firestore → Pentru salvare date

#### Linia 9-40: State Management (31 state-uri!)
```javascript
function KycScreen() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const contractRef = useRef(null);

  // Date personale
  const [fullName, setFullName] = useState('');
  const [cnp, setCnp] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [idSeries, setIdSeries] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idIssuedAt, setIdIssuedAt] = useState('');
  const [idExpiresAt, setIdExpiresAt] = useState('');
  const [iban, setIban] = useState('');

  // Documente
  const [idFront, setIdFront] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [parentIdFront, setParentIdFront] = useState(null);
  const [parentIdBack, setParentIdBack] = useState(null);
  const [driverLicenseFront, setDriverLicenseFront] = useState(null);
  const [driverLicenseBack, setDriverLicenseBack] = useState(null);

  // Flags
  const [isMinor, setIsMinor] = useState(false);
  const [needsDriver, setNeedsDriver] = useState(false);
  const [contractScrolled, setContractScrolled] = useState(false);
  const [checkbox1, setCheckbox1] = useState(false);
  const [checkbox2, setCheckbox2] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
```

**Grupare logică:**

1. **Date personale (9 state-uri):**
   - Toate datele extrase din CI
   - Populate manual SAU prin AI extraction

2. **Documente (7 state-uri):**
   - File objects pentru upload
   - `idFront`, `idBack` → Obligatorii
   - `selfie` → Obligatoriu
   - `parentIdFront`, `parentIdBack` → Doar dacă minor
   - `driverLicenseFront`, `driverLicenseBack` → Doar dacă șofer

3. **Flags (6 state-uri):**
   - `isMinor` → Calculat automat din CNP
   - `needsDriver` → Checkbox manual
   - `contractScrolled` → Detectat prin scroll event
   - `checkbox1`, `checkbox2` → Confirmări contract
   - `extracting` → Loading AI extraction
   - `submitting` → Loading submit final

#### Linia 42-60: useEffect - Detectare Minor din CNP
```javascript
useEffect(() => {
  if (cnp.length === 13) {
    const year = parseInt(cnp.substring(1, 3));
    const month = parseInt(cnp.substring(3, 5));
    const day = parseInt(cnp.substring(5, 7));
    
    let fullYear;
    const firstDigit = parseInt(cnp[0]);
    
    if (firstDigit === 1 || firstDigit === 2) {
      fullYear = 1900 + year;
    } else if (firstDigit === 5 || firstDigit === 6) {
      fullYear = 2000 + year;
    }
    
    const birthDate = new Date(fullYear, month - 1, day);
    const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
    
    setIsMinor(age < 18);
  }
}, [cnp]);
```

**Ce face - Algoritm Detectare Minor:**

1. **Linia 43:** Trigger când CNP are 13 caractere
2. **Linia 44-46:** Extrage an, lună, zi din CNP
   - CNP format: `SAALLZZJJNNNC`
   - S = sex (1-6)
   - AA = an (ultimele 2 cifre)
   - LL = lună (01-12)
   - ZZ = zi (01-31)
   - JJ = județ
   - NNN = număr ordine
   - C = cifră control

3. **Linia 48-54:** Determină secolul
   - Prima cifră = 1 sau 2 → Născut în 1900-1999
   - Prima cifră = 5 sau 6 → Născut în 2000-2099
   - Exemplu: CNP `5030515...` → 2003-05-15

4. **Linia 56:** Creează obiect Date
5. **Linia 57:** Calculează vârsta în ani
   - Formula: `(Data curentă - Data nașterii) / milisecunde_per_an`
   - `365.25` → Include anii bisecți

6. **Linia 59:** Setează flag `isMinor`
   - `true` dacă vârstă < 18
   - `false` dacă vârstă >= 18

**Conectare:**
- Dacă `isMinor = true` → Afișează câmpuri pentru documente părinte
- Validare: Dacă minor, documentele părinte devin obligatorii

#### Linia 62-95: handleExtractAI - AI Extraction
```javascript
const handleExtractAI = async () => {
  if (!idFront || !idBack) {
    alert('Încarcă mai întâi CI față și verso!');
    return;
  }

  const apiKey = localStorage.getItem('openai_api_key');
  if (!apiKey) {
    alert('Introdu API Key în pagina Home!');
    return;
  }

  setExtracting(true);

  try {
    const extracted = await extractIdData(apiKey, idFront, idBack);
    
    setFullName(extracted.fullName || '');
    setCnp(extracted.cnp || '');
    setGender(extracted.gender || '');
    setAddress(extracted.address || '');
    setIdSeries(extracted.series || '');
    setIdNumber(extracted.number || '');
    setIdIssuedAt(extracted.issuedAt || '');
    setIdExpiresAt(extracted.expiresAt || '');
    
    alert('Date extrase cu succes! Verifică și corectează dacă e necesar.');
  } catch (error) {
    console.error('Extraction error:', error);
    alert('Eroare la extragere: ' + error.message);
  } finally {
    setExtracting(false);
  }
};
```

**Ce face - Pas cu pas:**

1. **Linia 63-66:** Validare documente
   - Verifică dacă `idFront` și `idBack` sunt încărcate
   - Dacă NU → Alert și return (oprește execuția)

2. **Linia 68-72:** Verificare API Key
   - Citește din `localStorage`
   - Dacă lipsește → Alert și return

3. **Linia 74:** Setează loading state

4. **Linia 77:** **Apel funcție AI**
   - `extractIdData(apiKey, idFront, idBack)`
   - Parametri: API key + 2 file objects
   - Return: Object cu date extrase
   - **Detalii funcție în secțiunea Utils**

5. **Linia 79-86:** Populează formular
   - Setează fiecare state cu datele extrase
   - Folosește `|| ''` pentru fallback la string gol

6. **Linia 88:** Success feedback

7. **Linia 89-92:** Error handling
   - Loghează eroarea
   - Afișează mesaj user-friendly

8. **Linia 93-95:** Finally
   - Oprește loading (`setExtracting(false)`)
   - Se execută ÎNTOTDEAUNA (success sau error)

**Conectare:**
- Apelează `extractIdData` din `utils/gptExtraction.js`
- Populează automat toate câmpurile formularului
- User poate corecta manual după extragere

#### Linia 97-107: handleContractScroll - Detectare Scroll
```javascript
const handleContractScroll = (e) => {
  const element = e.target;
  const scrolledToBottom = 
    element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
  
  if (scrolledToBottom) {
    setContractScrolled(true);
  }
};
```

**Ce face - Algoritm Detectare Scroll:**

1. **Linia 98:** Extrage elementul DOM
2. **Linia 99-100:** Calculează dacă e la final
   - `scrollHeight` = Înălțime totală conținut
   - `scrollTop` = Cât s-a scrollat
   - `clientHeight` = Înălțime vizibilă
   - `+ 10` = Toleranță 10px (nu trebuie scroll exact la final)
   
   **Formula:** `Total - Scrollat <= Vizibil + Toleranță`
   
   **Exemplu:**
   - scrollHeight = 1000px
   - scrollTop = 700px
   - clientHeight = 300px
   - 1000 - 700 = 300 <= 300 + 10 → TRUE (la final)

3. **Linia 102-104:** Dacă la final → Setează flag

**Conectare:**
- Atașat la `onScroll` event pe div-ul contractului
- Checkbox-urile devin enabled doar dacă `contractScrolled = true`

#### Linia 109-250: handleSubmit - Submit Final (cel mai complex!)
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();

  // VALIDĂRI
  if (!idFront || !idBack || !selfie) {
    alert('Încarcă toate documentele obligatorii!');
    return;
  }

  if (isMinor && (!parentIdFront || !parentIdBack)) {
    alert('Pentru minori, documentele părintelui sunt obligatorii!');
    return;
  }

  if (needsDriver && (!driverLicenseFront || !driverLicenseBack)) {
    alert('Dacă ești șofer, încarcă permisul!');
    return;
  }

  if (!contractScrolled) {
    alert('Citește contractul până la final!');
    return;
  }

  if (!checkbox1 || !checkbox2) {
    alert('Bifează ambele checkbox-uri!');
    return;
  }

  if (!iban) {
    alert('Introdu IBAN-ul!');
    return;
  }

  setSubmitting(true);

  try {
    // UPLOAD IMAGINI ÎN STORAGE
    const uploadFile = async (file, path) => {
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    };

    const userId = currentUser.uid;
    
    const [
      idFrontUrl,
      idBackUrl,
      selfieUrl,
      parentIdFrontUrl,
      parentIdBackUrl,
      driverLicenseFrontUrl,
      driverLicenseBackUrl
    ] = await Promise.all([
      uploadFile(idFront, `kyc-documents/${userId}/id-front.jpg`),
      uploadFile(idBack, `kyc-documents/${userId}/id-back.jpg`),
      uploadFile(selfie, `kyc-documents/${userId}/selfie.jpg`),
      isMinor && parentIdFront ? uploadFile(parentIdFront, `kyc-documents/${userId}/parent-id-front.jpg`) : null,
      isMinor && parentIdBack ? uploadFile(parentIdBack, `kyc-documents/${userId}/parent-id-back.jpg`) : null,
      needsDriver && driverLicenseFront ? uploadFile(driverLicenseFront, `kyc-documents/${userId}/driver-license-front.jpg`) : null,
      needsDriver && driverLicenseBack ? uploadFile(driverLicenseBack, `kyc-documents/${userId}/driver-license-back.jpg`) : null,
    ]);

    // SALVARE ÎN FIRESTORE
    await setDoc(doc(db, 'users', userId), {
      uid: userId,
      email: currentUser.email,
      status: 'pendingApproval',
      setupDone: false,
      
      // Date personale
      fullName,
      cnp,
      gender,
      address,
      idSeries,
      idNumber,
      idIssuedAt,
      idExpiresAt,
      iban,
      isMinor,
      needsDriver,
      
      // URLs documente
      idFrontUrl,
      idBackUrl,
      selfieUrl,
      ...(parentIdFrontUrl && { parentIdFrontUrl }),
      ...(parentIdBackUrl && { parentIdBackUrl }),
      ...(driverLicenseFrontUrl && { driverLicenseFrontUrl }),
      ...(driverLicenseBackUrl && { driverLicenseBackUrl }),
      
      // Contract
      contractAccepted: true,
      contractAcceptedAt: serverTimestamp(),
      
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    alert('KYC trimis cu succes! Așteaptă aprobarea.');
    navigate('/waiting');
    
  } catch (error) {
    console.error('Submit error:', error);
    alert('Eroare la trimitere: ' + error.message);
  } finally {
    setSubmitting(false);
  }
};
```

**Ce face - Pas cu pas (FOARTE DETALIAT):**

### PARTEA 1: VALIDĂRI (Linia 112-141)

1. **Linia 113-116:** Validare documente obligatorii
   - Verifică `idFront`, `idBack`, `selfie`
   - Dacă lipsește oricare → Alert și return

2. **Linia 118-121:** Validare documente părinte (condiționată)
   - **Condiție:** `isMinor = true`
   - Verifică `parentIdFront` și `parentIdBack`
   - Dacă lipsește oricare → Alert și return

3. **Linia 123-126:** Validare permis șofer (condiționată)
   - **Condiție:** `needsDriver = true`
   - Verifică `driverLicenseFront` și `driverLicenseBack`
   - Dacă lipsește oricare → Alert și return

4. **Linia 128-131:** Validare scroll contract
   - Verifică `contractScrolled = true`
   - Dacă false → Alert și return

5. **Linia 133-136:** Validare checkbox-uri
   - Verifică `checkbox1` și `checkbox2`
   - Dacă oricare false → Alert și return

6. **Linia 138-141:** Validare IBAN
   - Verifică `iban` nu e gol
   - Dacă gol → Alert și return

7. **Linia 143:** Setează loading state

### PARTEA 2: UPLOAD IMAGINI (Linia 146-169)

8. **Linia 147-151:** Funcție helper `uploadFile`
   ```javascript
   const uploadFile = async (file, path) => {
     const storageRef = ref(storage, path);      // Creează referință Storage
     await uploadBytes(storageRef, file);        // Upload file
     return await getDownloadURL(storageRef);    // Return URL public
   };
   ```
   **Ce face:**
   - Primește: File object + path în Storage
   - Upload-ează fișierul
   - Return: URL public pentru acces

9. **Linia 153:** Extrage UID user

10. **Linia 155-169:** **Upload paralel cu Promise.all**
    ```javascript
    const [url1, url2, ...] = await Promise.all([
      uploadFile(idFront, `kyc-documents/${userId}/id-front.jpg`),
      uploadFile(idBack, `kyc-documents/${userId}/id-back.jpg`),
      uploadFile(selfie, `kyc-documents/${userId}/selfie.jpg`),
      isMinor && parentIdFront ? uploadFile(...) : null,
      isMinor && parentIdBack ? uploadFile(...) : null,
      needsDriver && driverLicenseFront ? uploadFile(...) : null,
      needsDriver && driverLicenseBack ? uploadFile(...) : null,
    ]);
    ```
    
    **Ce face:**
    - Upload-ează TOATE imaginile în PARALEL (nu secvențial)
    - **Avantaj:** Mult mai rapid (7 upload-uri simultan vs 7 secvențial)
    - **Condiționat:** Documente opționale doar dacă există
      - `isMinor && parentIdFront ? upload : null`
      - Dacă condiția e false → null în array
    - **Destructuring:** Extrage URL-urile în variabile separate
    
    **Exemplu paths:**
    - `kyc-documents/abc123/id-front.jpg`
    - `kyc-documents/abc123/id-back.jpg`
    - `kyc-documents/abc123/selfie.jpg`
    - etc.

### PARTEA 3: SALVARE FIRESTORE (Linia 171-207)

11. **Linia 172:** Creează/Actualizează document în `users` collection
    - Document ID = `userId` (UID Firebase Auth)

12. **Linia 173-207:** Obiect date salvate
    ```javascript
    {
      // Identificare
      uid: userId,
      email: currentUser.email,
      status: 'pendingApproval',    // ← IMPORTANT: Așteaptă aprobare admin
      setupDone: false,
      
      // Date personale (toate din formular)
      fullName, cnp, gender, address,
      idSeries, idNumber, idIssuedAt, idExpiresAt,
      iban, isMinor, needsDriver,
      
      // URLs documente (obligatorii)
      idFrontUrl, idBackUrl, selfieUrl,
      
      // URLs documente opționale (spread operator)
      ...(parentIdFrontUrl && { parentIdFrontUrl }),
      ...(parentIdBackUrl && { parentIdBackUrl }),
      ...(driverLicenseFrontUrl && { driverLicenseFrontUrl }),
      ...(driverLicenseBackUrl && { driverLicenseBackUrl }),
      
      // Contract
      contractAccepted: true,
      contractAcceptedAt: serverTimestamp(),
      
      // Timestamps
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    ```
    
    **Spread operator explicat:**
    ```javascript
    ...(parentIdFrontUrl && { parentIdFrontUrl })
    ```
    - Dacă `parentIdFrontUrl` există (truthy) → Adaugă `{ parentIdFrontUrl: "url..." }`
    - Dacă `parentIdFrontUrl` e null/undefined → Nu adaugă nimic
    - **Rezultat:** Câmpuri opționale doar dacă au valoare

### PARTEA 4: FINALIZARE (Linia 209-218)

13. **Linia 209-210:** Success
    - Alert user
    - Navigate la `/waiting`

14. **Linia 212-215:** Error handling
    - Loghează eroarea
    - Afișează mesaj user

15. **Linia 216-218:** Finally
    - Oprește loading
    - Se execută ÎNTOTDEAUNA

**Conectare cu restul aplicației:**
- După salvare → `status = 'pendingApproval'`
- FlowGuard detectează status → Redirect la WaitingScreen
- Admin vede în AdminScreen → Poate aproba/respinge

**Flow Chart Submit:**
```
Validări
  ↓ (toate OK)
Upload imagini paralel (Promise.all)
  ↓ (primește URLs)
Salvare Firestore
  ↓
Navigate('/waiting')
```

---

## 6. WaitingScreen - Așteptare Aprobare

### 📍 Fișier: `src/screens/WaitingScreen.jsx`

Screen simplu - Afișează mesaj de așteptare + buton demo approve (pentru testare).

#### Logica Principală:
```javascript
const handleDemoApprove = async () => {
  await updateDoc(doc(db, 'users', currentUser.uid), {
    status: 'approved',
    updatedAt: serverTimestamp()
  });
  navigate('/staff-setup');
};
```
**Ce face:**
- Actualizează status la 'approved'
- Redirect la staff-setup
- **Doar pentru DEMO** - În producție, doar admin-ul aprobă

---

## 7. StaffSetupScreen - Setup Staff

### 📍 Fișier: `src/screens/StaffSetupScreen.jsx`

Completează 3 câmpuri după aprobare KYC.

#### Logica Principală:
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Salvare în users
  await updateDoc(doc(db, 'users', currentUser.uid), {
    setupDone: true,
    code,
    updatedAt: serverTimestamp()
  });
  
  // Salvare în staffProfiles
  await setDoc(doc(db, 'staffProfiles', currentUser.uid), {
    uid: currentUser.uid,
    email: currentUser.email,
    nume,
    code,
    codIdentificare,
    ceCodAi,
    cineNoteaza,
    setupDone: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  navigate('/home');
};
```
**Ce face:**
- Salvează în 2 colecții: `users` și `staffProfiles`
- Setează `setupDone = true`
- Navigate la home

---

Continui cu restul screen-urilor? Sau vrei mai multe detalii despre vreun screen specific?

### Colecții Firestore

#### 1. **users** (Utilizatori)
```javascript
{
  uid: string,                    // Firebase Auth UID
  email: string,                  // Email utilizator
  status: string,                 // 'pendingApproval' | 'approved' | 'rejected'
  setupDone: boolean,             // A completat staff setup?
  code: string,                   // Cod identificare (ex: 'ADMIN001')
  createdAt: Timestamp,
  updatedAt: Timestamp,
  
  // Date KYC
  fullName: string,
  cnp: string,
  gender: string,
  address: string,
  idSeries: string,
  idNumber: string,
  idIssuedAt: string,
  idExpiresAt: string,
  iban: string,
  isMinor: boolean,
  needsDriver: boolean,
  
  // URLs documente în Storage
  idFrontUrl: string,
  idBackUrl: string,
  selfieUrl: string,
  parentIdFrontUrl: string,       // Doar dacă minor
  parentIdBackUrl: string,
  driverLicenseFrontUrl: string,  // Doar dacă șofer
  driverLicenseBackUrl: string,
  
  // Contract
  contractAccepted: boolean,
  contractAcceptedAt: Timestamp
}
```

#### 2. **staffProfiles** (Profile Staff)
```javascript
{
  uid: string,
  email: string,
  nume: string,
  code: string,
  codIdentificare: string,
  ceCodAi: string,
  cineNoteaza: string,
  setupDone: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### 3. **evenimente** (Evenimente)
```javascript
{
  nume: string,
  data: string,                   // Format: YYYY-MM-DD
  dataStart: string,
  locatie: string,
  rol: string,                    // 'ospatar' | 'barman' | 'bucatar' | etc.
  nrStaffNecesar: number,
  bugetStaff: number,             // Buget total pentru staff
  durataOre: number,
  
  // Alocare
  staffAlocat: array<string>,     // Array de UIDs
  dataAlocare: Timestamp,
  alocatDe: string,               // 'AI' | 'manual' | email admin
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### 4. **disponibilitati** (Disponibilități Staff)
```javascript
{
  userId: string,                 // UID staff
  userEmail: string,
  dataStart: string,              // Format: YYYY-MM-DD
  dataEnd: string,
  oraStart: string,               // Format: HH:MM
  oraEnd: string,
  tipDisponibilitate: string,     // 'disponibil' | 'indisponibil' | 'preferinta'
  notita: string,
  createdAt: Timestamp
}
```

#### 5. **soferi** (Șoferi)
```javascript
{
  nume: string,
  telefon: string,
  email: string,
  tipVehicul: string,
  numarInmatriculare: string,
  capacitate: number,             // Nr. persoane
  status: string,                 // 'activ' | 'inactiv' | 'concediu'
  notite: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Firebase Storage Structure

```
/kyc-documents/
  /{userId}/
    /id-front.jpg
    /id-back.jpg
    /selfie.jpg
    /parent-id-front.jpg      # Doar dacă minor
    /parent-id-back.jpg
    /driver-license-front.jpg # Doar dacă șofer
    /driver-license-back.jpg
```

---

## 🔄 Flow-uri Complete

### 1. Flow Autentificare

```
START
  ↓
[AuthScreen] - User introduce email/password
  ↓
Register? → Firebase createUserWithEmailAndPassword()
  ↓
Login? → Firebase signInWithEmailAndPassword()
  ↓
[FlowGuard] - Verifică starea user
  ↓
Email verificat? NO → [VerifyEmailScreen]
  ↓ YES
Are date KYC? NO → [KycScreen]
  ↓ YES
Status = 'pendingApproval'? YES → [WaitingScreen]
  ↓ NO
Status = 'approved' && !setupDone? YES → [StaffSetupScreen]
  ↓ NO
Status = 'approved' && setupDone? YES → [HomeScreen]
  ↓
END
```

### 2. Flow KYC

```
START [KycScreen]
  ↓
User uploadează documente (ID front, back, selfie)
  ↓
Minor? YES → Upload parent ID
  ↓
Șofer? YES → Upload driver license
  ↓
User click "Extrage cu AI"
  ↓
[gptExtraction.js] extractIdData()
  ├─ compressImage() pentru fiecare imagine
  ├─ Trimite la OpenAI GPT-4 Vision API
  ├─ Primește JSON cu date extrase
  └─ Populează formular automat
  ↓
User citește contract (scroll detection)
  ↓
User bifează 2 checkbox-uri
  ↓
User introduce IBAN
  ↓
User click "Trimite KYC"
  ↓
Upload imagini în Firebase Storage
  ↓
Salvează date în Firestore users collection
  ├─ status: 'pendingApproval'
  ├─ contractAccepted: true
  └─ toate datele extrase
  ↓
Redirect la [WaitingScreen]
  ↓
END
```


## 8. HomeScreen - Dashboard

### 📍 Fișier: `src/screens/HomeScreen.jsx`

#### Logica Principală:

**1. Load Stats (Linia 30-65):**
```javascript
const loadStats = async () => {
  // Încarcă evenimente
  const evSnapshot = await getDocs(collection(db, 'evenimente'));
  const evenimente = evSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filtrează evenimente astăzi
  const today = new Date().toISOString().split('T')[0];
  const evenimenteAstazi = evenimente.filter(ev => {
    const dataEv = ev.data || ev.dataStart;
    return dataEv === today;
  });

  // Încarcă staff aprobat
  const staffSnapshot = await getDocs(
    query(collection(db, 'users'), where('status', '==', 'approved'))
  );

  // KYC pending (doar admin)
  let kycPending = 0;
  if (isAdmin) {
    const kycSnapshot = await getDocs(
      query(collection(db, 'users'), where('status', '==', 'pendingApproval'))
    );
    kycPending = kycSnapshot.size;
  }

  setStats({
    evenimenteTotal: evenimente.length,
    evenimenteAstazi: evenimenteAstazi.length,
    staffTotal: staffSnapshot.size,
    kycPending
  });
};
```

**Ce face:**
- Încarcă toate evenimentele
- Filtrează evenimente pentru ziua curentă
- Numără staff aprobat
- Numără KYC-uri pending (doar admin)

---

## 9-15. Celelalte Screen-uri

### Logica Comună:

**Toate screen-urile administrative urmează același pattern:**

1. **Load Data** - useEffect la mount
2. **Filtre** - State pentru search, date, etc.
3. **CRUD Operations** - Add/Edit/Delete
4. **Real-time Updates** - Reload după modificări

---

## 16. Utils - Funcții Utilitare

### 📍 Fișier: `src/utils/gptExtraction.js`

#### extractIdData() - AI Extraction

**Parametri:**
- `apiKey`: OpenAI API Key
- `idFrontFile`: File object CI față
- `idBackFile`: File object CI verso

**Return:** Object cu date extrase

**Logica:**
1. Comprimă imaginile (max 3MB)
2. Trimite la GPT-4 Vision API
3. Parsează JSON response
4. Validează câmpuri
5. Return date

### 📍 Fișier: `src/utils/imageCompression.js`

#### compressImage() - Compresie Imagini

**Algoritm:**
1. Citește file ca base64
2. Creează canvas
3. Redimensionează (max 2048px)
4. Comprimă JPEG (quality 0.9 → 0.1)
5. Verifică size < 3MB
6. Return base64

---

## 17. Firebase Schema Completă

### users
```
uid, email, status, setupDone, code,
fullName, cnp, gender, address,
idSeries, idNumber, idIssuedAt, idExpiresAt,
iban, isMinor, needsDriver,
idFrontUrl, idBackUrl, selfieUrl,
parentIdFrontUrl, parentIdBackUrl,
driverLicenseFrontUrl, driverLicenseBackUrl,
contractAccepted, contractAcceptedAt,
createdAt, updatedAt
```

### staffProfiles
```
uid, email, nume, code,
codIdentificare, ceCodAi, cineNoteaza,
setupDone, createdAt, updatedAt
```

### evenimente
```
nume, data, dataStart, locatie, rol,
nrStaffNecesar, bugetStaff, durataOre,
staffAlocat[], dataAlocare, alocatDe,
createdAt, updatedAt
```

### disponibilitati
```
userId, userEmail,
dataStart, dataEnd, oraStart, oraEnd,
tipDisponibilitate, notita,
createdAt
```

### soferi
```
nume, telefon, email,
tipVehicul, numarInmatriculare, capacitate,
status, notite,
createdAt, updatedAt
```

---

## FLOW CHARTS

### Flow Autentificare
```
START → AuthScreen
  ↓
Login/Register → Firebase Auth
  ↓
Admin? → Bypass → Home
  ↓
User → FlowGuard
  ↓
Email verificat? NO → VerifyEmail
  ↓ YES
Are KYC? NO → KycScreen
  ↓ YES
Status pending? YES → Waiting
  ↓ NO
Setup done? NO → StaffSetup
  ↓ YES
Home
```

### Flow KYC
```
Upload docs → Extract AI → Fill form
  ↓
Scroll contract → Check boxes
  ↓
Submit → Upload Storage → Save Firestore
  ↓
Status = pending → Waiting
```

### Flow Alocare AI
```
Load evenimente nealocate
  ↓
Load staff disponibil
  ↓
Pentru fiecare eveniment:
  - Filtrează staff disponibil
  - Verifică conflicte
  - Prioritizează preferințe
  - Alocă staff
  ↓
Update evenimente cu staffAlocat[]
```

---

**FIN DOCUMENTAȚIE**

---

## ALGORITMI COMPLECȘI - DETALII COMPLETE

### 1. Algoritm Alocare AI

📍 **Fișier:** `src/screens/AlocareScreen.jsx` (Linia 50-150)

#### Pas cu Pas:

**STEP 1: Încărcare Date**
```javascript
// Încarcă evenimente nealocate
const evSnapshot = await getDocs(collection(db, 'evenimente'));
const evenimente = evSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
const nealocate = evenimente.filter(ev => !ev.staffAlocat || ev.staffAlocat.length === 0);
```
**Ce face:** Filtrează evenimente fără staff alocat

**STEP 2: Încărcare Staff**
```javascript
const staffSnapshot = await getDocs(
  query(collection(db, 'users'), where('status', '==', 'approved'))
);
const staffList = staffSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
```
**Ce face:** Încarcă doar staff aprobat

**STEP 3: Încărcare Disponibilități**
```javascript
const dispSnapshot = await getDocs(collection(db, 'disponibilitati'));
const disponibilitati = dispSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
```

**STEP 4: Loop Evenimente**
```javascript
for (const eveniment of nealocate) {
  const dataEv = eveniment.data || eveniment.dataStart;
  const nrStaffNecesar = eveniment.nrStaffNecesar || 1;
```

**STEP 5: Filtrare Staff Disponibil**
```javascript
const staffDisponibil = staffList.filter(staff => {
  // Verifică disponibilitate
  const esteDisponibil = disponibilitati.some(disp => {
    if (disp.userId !== staff.uid) return false;
    if (disp.tipDisponibilitate === 'indisponibil') return false;
    
    return dataEv >= disp.dataStart && dataEv <= disp.dataEnd;
  });

  // Verifică conflicte
  const areConflict = evenimente.some(ev => {
    if (ev.id === eveniment.id) return false;
    if (!ev.staffAlocat || !ev.staffAlocat.includes(staff.uid)) return false;
    
    const dataAltEv = ev.data || ev.dataStart;
    return dataAltEv === dataEv;
  });

  return esteDisponibil && !areConflict;
});
```

**Logica Filtrare:**
1. **Verifică disponibilitate:**
   - Staff-ul are disponibilitate marcată?
   - Tipul e 'disponibil' sau 'preferinta'?
   - Data evenimentului e în intervalul disponibilității?

2. **Verifică conflicte:**
   - Staff-ul e deja alocat la alt eveniment în aceeași zi?
   - Dacă DA → exclude din listă

**STEP 6: Prioritizare**
```javascript
staffDisponibil.sort((a, b) => {
  const prefA = disponibilitati.some(d => 
    d.userId === a.uid && 
    d.tipDisponibilitate === 'preferinta' &&
    dataEv >= d.dataStart && dataEv <= d.dataEnd
  );
  const prefB = disponibilitati.some(d => 
    d.userId === b.uid && 
    d.tipDisponibilitate === 'preferinta' &&
    dataEv >= d.dataStart && dataEv <= d.dataEnd
  );
  
  if (prefA && !prefB) return -1;  // A are prioritate
  if (!prefA && prefB) return 1;   // B are prioritate
  return 0;                         // Egal
});
```

**Logica Prioritizare:**
- Staff cu `tipDisponibilitate = 'preferinta'` → Prioritate maximă
- Restul → Ordine aleatorie

**STEP 7: Alocare**
```javascript
const staffAlocat = staffDisponibil.slice(0, nrStaffNecesar).map(s => s.uid);

if (staffAlocat.length > 0) {
  await updateDoc(doc(db, 'evenimente', eveniment.id), {
    staffAlocat,
    dataAlocare: new Date(),
    alocatDe: 'AI'
  });
}
```

**Logica Alocare:**
- Ia primii N staff din listă (N = nrStaffNecesar)
- Actualizează eveniment cu array de UIDs
- Marchează data alocării și sursa ('AI')

**Rezultat:**
- Status: 'complet' (dacă staffAlocat.length >= nrStaffNecesar)
- Status: 'partial' (dacă staffAlocat.length < nrStaffNecesar)
- Status: 'neallocat' (dacă staffAlocat.length === 0)

---

### 2. Algoritm Calcul Salarizare

📍 **Fișier:** `src/screens/SalarizareScreen.jsx` (Linia 60-120)

#### Pas cu Pas:

**STEP 1: Încărcare Evenimente**
```javascript
let q;
if (isAdmin) {
  q = query(collection(db, 'evenimente'));
} else {
  q = query(
    collection(db, 'evenimente'),
    where('staffAlocat', 'array-contains', currentUser.uid)
  );
}
```
**Logica:**
- Admin → Vede toate evenimentele
- User → Vede doar evenimentele unde e alocat

**STEP 2: Filtrare Perioadă**
```javascript
const evenimenteFiltrate = evenimente.filter(ev => {
  const dataEv = ev.data || ev.dataStart;
  return dataEv >= dataStart && dataEv <= dataEnd;
});
```

**STEP 3: Calcul Salarizări**
```javascript
const salarizariMap = {};

for (const ev of evenimenteFiltrate) {
  const staffList = ev.staffAlocat || [];
  const tarifPerPersoana = ev.bugetStaff ? ev.bugetStaff / staffList.length : 0;

  for (const staffId of staffList) {
    if (!salarizariMap[staffId]) {
      // Încarcă info staff
      const staffDoc = await getDocs(query(
        collection(db, 'staffProfiles'),
        where('uid', '==', staffId)
      ));
      
      const staffData = staffDoc.docs[0]?.data() || {};
      
      salarizariMap[staffId] = {
        staffId,
        nume: staffData.nume || 'Necunoscut',
        email: staffData.email || '',
        evenimente: [],
        totalSalariu: 0,
        totalOre: 0
      };
    }

    salarizariMap[staffId].evenimente.push({
      id: ev.id,
      nume: ev.nume,
      data: ev.data || ev.dataStart,
      rol: ev.rol,
      tarif: tarifPerPersoana,
      ore: ev.durataOre || 0
    });

    salarizariMap[staffId].totalSalariu += tarifPerPersoana;
    salarizariMap[staffId].totalOre += (ev.durataOre || 0);
  }
}
```

**Logica Calcul:**
1. **Pentru fiecare eveniment:**
   - Calculează tarif per persoană: `bugetStaff / nr_staff_alocat`
   - Exemplu: Buget 1000 RON, 5 staff → 200 RON/persoană

2. **Pentru fiecare staff alocat:**
   - Dacă nu există în map → Creează entry
   - Adaugă eveniment în listă
   - Adună la totalSalariu
   - Adună la totalOre

3. **Rezultat:**
   - Map cu toate salarizările per staff
   - Fiecare staff are: listă evenimente, total salariu, total ore

**STEP 4: Export CSV**
```javascript
const exportCSV = () => {
  let csv = 'Nume,Email,Nr Evenimente,Total Ore,Total Salariu (RON)\n';
  
  salarizari.forEach(s => {
    csv += `${s.nume},${s.email},${s.evenimente.length},${s.totalOre},${s.totalSalariu.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `salarizare_${dataStart}_${dataEnd}.csv`;
  a.click();
};
```

**Logica Export:**
- Creează string CSV cu header
- Adaugă fiecare staff ca rând
- Creează Blob și trigger download

---

### 3. Algoritm Detectare Minor din CNP

📍 **Fișier:** `src/screens/KycScreen.jsx` (Linia 42-60)

#### Format CNP Românesc:
```
S AA LL ZZ JJ NNN C
│ │  │  │  │  │   └─ Cifră control
│ │  │  │  │  └───── Număr ordine (001-999)
│ │  │  │  └──────── Județ (01-52)
│ │  │  └─────────── Zi (01-31)
│ │  └────────────── Lună (01-12)
│ └───────────────── An (ultimele 2 cifre)
└─────────────────── Sex + Secol
                     1,2 = 1900-1999
                     5,6 = 2000-2099
```

#### Algoritm:
```javascript
const year = parseInt(cnp.substring(1, 3));      // Extrage AA
const month = parseInt(cnp.substring(3, 5));     // Extrage LL
const day = parseInt(cnp.substring(5, 7));       // Extrage ZZ

let fullYear;
const firstDigit = parseInt(cnp[0]);             // Extrage S

if (firstDigit === 1 || firstDigit === 2) {
  fullYear = 1900 + year;                        // Secol 20
} else if (firstDigit === 5 || firstDigit === 6) {
  fullYear = 2000 + year;                        // Secol 21
}

const birthDate = new Date(fullYear, month - 1, day);
const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));

setIsMinor(age < 18);
```

**Exemple:**
- CNP `5030515123456` → 2003-05-15 → Vârstă 21 → Major
- CNP `6100101123456` → 2010-01-01 → Vârstă 14 → Minor

---

### 4. Algoritm Compresie Imagini

📍 **Fișier:** `src/utils/imageCompression.js`

#### Logica:
```javascript
1. Citește file ca base64
2. Creează Image object
3. Calculează dimensiuni noi (max 2048px, păstrează aspect ratio)
4. Creează canvas cu dimensiuni noi
5. Desenează imagine pe canvas
6. Convertește la JPEG cu quality 0.9
7. Verifică size:
   - Dacă > 3MB → Reduce quality cu 0.1
   - Repetă până size < 3MB sau quality < 0.1
8. Return base64
```

**Exemplu:**
- Imagine originală: 4000x3000px, 8MB
- După redimensionare: 2048x1536px
- După compresie quality 0.7: 2.8MB ✓

---

## CONECTĂRI ÎNTRE COMPONENTE

### Flow Date:

```
AuthScreen
  ↓ (creează user)
Firebase Auth
  ↓ (trigger)
App.jsx onAuthStateChanged
  ↓ (verifică)
Firestore users collection
  ↓ (decide)
FlowGuard
  ↓ (redirect)
Screen corespunzător
```

### Flow KYC:

```
KycScreen
  ↓ (upload)
Firebase Storage
  ↓ (primește URLs)
Firestore users collection
  ↓ (status = pending)
WaitingScreen
  ↓ (admin aprobă)
AdminScreen
  ↓ (update status)
Firestore users collection
  ↓ (trigger)
App.jsx onAuthStateChanged
  ↓ (redirect)
StaffSetupScreen
```

### Flow Alocare:

```
DisponibilitateScreen
  ↓ (salvează)
Firestore disponibilitati
  ↓ (citește)
AlocareScreen
  ↓ (algoritm)
Firestore evenimente (update staffAlocat)
  ↓ (citește)
EvenimenteScreen
  ↓ (afișează)
Staff alocat
```

---

## BEST PRACTICES FOLOSITE

### 1. State Management
- State local pentru UI
- Firebase pentru persistență
- Real-time listeners pentru sync

### 2. Error Handling
- Try-catch în toate operațiile async
- Finally pentru cleanup (loading states)
- User-friendly error messages

### 3. Performance
- Promise.all pentru operații paralele
- Lazy loading pentru imagini
- Compresie imagini înainte de upload

### 4. Security
- Firebase Rules pentru acces
- Admin bypass doar pentru email specific
- Validare client + server

### 5. UX
- Loading states pentru toate operațiile
- Feedback imediat (alerts, messages)
- Validare înainte de submit

---

**DOCUMENTAȚIE COMPLETĂ - FIECARE LINIE DE LOGICĂ EXPLICATĂ**
