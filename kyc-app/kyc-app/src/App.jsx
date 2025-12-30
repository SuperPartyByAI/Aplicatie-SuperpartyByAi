import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import Toast from './components/Toast';
import LoadingSpinner from './components/LoadingSpinner';

// Eager loading pentru auth flow (critical)
import AuthScreen from './screens/AuthScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import KycScreen from './screens/KycScreen';
import WaitingScreen from './screens/WaitingScreen';
import StaffSetupScreen from './screens/StaffSetupScreen';

// Lazy loading pentru dashboard și admin pages
const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const EvenimenteScreen = lazy(() => import('./screens/EvenimenteScreen'));
const AdminScreen = lazy(() => import('./screens/AdminScreen'));
const ChatClientiScreen = lazy(() => import('./screens/ChatClientiScreen'));
const DisponibilitateScreen = lazy(() => import('./screens/DisponibilitateScreen'));
const SalarizareScreen = lazy(() => import('./screens/SalarizareScreen'));
const SoferiScreen = lazy(() => import('./screens/SoferiScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const CentralaTelefonicaScreen = lazy(() => import('./screens/CentralaTelefonicaScreen'));
const ClientiDisponibiliScreen = lazy(() => import('./screens/ClientiDisponibiliScreen'));
const WhatsAppChatScreen = lazy(() => import('./screens/WhatsAppChatScreen'));

function App() {
  return (
    <>
      <Toast />
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner message="Se încarcă..." />}>
          <Routes>
            <Route path="/" element={<FlowGuard />} />
            <Route path="/verify-email" element={<VerifyEmailScreen />} />
            <Route path="/kyc" element={<KycScreen />} />
            <Route path="/waiting" element={<WaitingScreen />} />
            <Route path="/staff-setup" element={<StaffSetupScreen />} />
            <Route path="/home" element={<HomeScreen />} />
            <Route path="/evenimente" element={<EvenimenteScreen />} />
            <Route path="/disponibilitate" element={<DisponibilitateScreen />} />
            <Route path="/salarizare" element={<SalarizareScreen />} />
            <Route path="/soferi" element={<SoferiScreen />} />
            <Route path="/admin" element={<AdminScreen />} />
            <Route path="/chat-clienti" element={<ChatClientiScreen />} />
            <Route path="/centrala-telefonica" element={<CentralaTelefonicaScreen />} />
            <Route path="/whatsapp/available" element={<ClientiDisponibiliScreen />} />
            <Route path="/whatsapp/chat" element={<WhatsAppChatScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </>
  );
}

function FlowGuard() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          
          // Bypass pentru admin
          if (firebaseUser.email === 'ursache.andrei1995@gmail.com') {
            // Setează datele în Firestore
            const userRef = doc(db, 'users', firebaseUser.uid);
            const staffRef = doc(db, 'staffProfiles', firebaseUser.uid);
            
            await Promise.all([
              setDoc(userRef, {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                status: 'approved',
                setupDone: true,
                code: 'ADMIN001',
                updatedAt: serverTimestamp(),
              }, { merge: true }),
              setDoc(staffRef, {
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

            // Setează state-ul local
            setUserData({ status: 'approved', setupDone: true, code: 'ADMIN001' });
          } else {
            // Obține date user din Firestore
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
              setUserData(userDoc.data());
            } else {
              // Creează document dacă nu există
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                status: 'kyc_required',
                createdAt: serverTimestamp(),
              });
              setUserData({ status: 'kyc_required' });
            }
          }
        } else {
          setUser(null);
          setUserData(null);
        }
      } catch (error) {
        console.error('Error in auth flow:', error);
        setUserData({ status: 'kyc_required' });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="screen-container"><div className="card">Loading...</div></div>;
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
}

export default App;
