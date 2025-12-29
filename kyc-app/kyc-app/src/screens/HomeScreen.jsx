import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage, callChatWithAI, callAIManager } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut, onAuthStateChanged } from 'firebase/auth';

function HomeScreen() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [staffProfile, setStaffProfile] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [adminMode, setAdminMode] = useState(false); // Toggle admin mode
  const [gmMode, setGmMode] = useState(false); // Toggle GM mode
  const [currentView, setCurrentView] = useState('dashboard'); // dashboard, admin-kyc, admin-conversations, gm-overview, gm-analytics
  const [kycSubmissions, setKycSubmissions] = useState([]);
  const [aiConversations, setAiConversations] = useState([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  
  // GM state
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loadingGM, setLoadingGM] = useState(false);
  
  // GM Conversations state
  const [gmUsers, setGmUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userConversations, setUserConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  
  // Correction modal state
  const [correctionModal, setCorrectionModal] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [correctedResponse, setCorrectedResponse] = useState('');
  const [correctionPrompt, setCorrectionPrompt] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [conversationCorrections, setConversationCorrections] = useState({}); // Map conversationId -> correction
  const sidebarRef = useRef(null);
  const chatMessagesRef = useRef(null);
  
  // Chat state
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [{ role: 'assistant', content: 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?' }];
      }
    }
    return [{ role: 'assistant', content: 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?' }];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  
  // Image upload state
  const [selectedImages, setSelectedImages] = useState([]);
  const fileInputRef = useRef(null);

  // Salvează istoric chat
  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
  }, [messages]);

  // Theme toggle
  useEffect(() => {
    document.body.className = theme === 'light' ? 'light-theme' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };
  const [stats, setStats] = useState({
    evenimenteTotal: 0,
    evenimenteNealocate: 0,
    staffTotal: 0,
    kycPending: 0
  });
  const [loading, setLoading] = useState(true);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user?.email || 'No user');
      setCurrentUser(user);
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadStaffProfile = async () => {
      if (currentUser) {
        const staffDoc = await getDoc(doc(db, 'staffProfiles', currentUser.uid));
        if (staffDoc.exists()) {
          setStaffProfile(staffDoc.data());
        }
      }
    };
    
    loadStaffProfile();
    loadStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Load GM users when entering GM conversations view
  useEffect(() => {
    if (gmMode && currentView === 'gm-conversations' && gmUsers.length === 0) {
      loadGMUsers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmMode, currentView]);

  // Load GM Users and Conversations
  const loadGMUsers = async () => {
    setLoadingConversations(true);
    try {
      // Încarcă toate conversațiile
      const convQuery = query(
        collection(db, 'aiConversations'),
        orderBy('timestamp', 'desc'),
        limit(1000)
      );
      const convSnapshot = await getDocs(convQuery);
      const conversations = convSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }));

      // Grupează pe useri
      const usersMap = {};
      conversations.forEach(conv => {
        const userId = conv.userId;
        if (!usersMap[userId]) {
          usersMap[userId] = {
            userId,
            userName: conv.userName || 'Unknown',
            userEmail: conv.userEmail || 'unknown@email.com',
            conversations: [],
            lastConversation: conv.timestamp
          };
        }
        usersMap[userId].conversations.push(conv);
      });

      // Convertește în array și sortează după ultima conversație
      const usersArray = Object.values(usersMap).sort((a, b) => 
        b.lastConversation - a.lastConversation
      );

      console.log('📊 GM Users loaded:', usersArray.length, 'users');
      console.log('💬 Total conversations:', conversations.length);
      
      // Încarcă și corecțiile
      const correctionsQuery = query(collection(db, 'aiCorrections'));
      const correctionsSnapshot = await getDocs(correctionsQuery);
      const correctionsMap = {};
      correctionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        correctionsMap[data.conversationId] = {
          id: doc.id,
          ...data,
          correctedAt: data.correctedAt?.toDate()
        };
      });
      
      console.log('✏️ Corrections loaded:', Object.keys(correctionsMap).length);
      
      setGmUsers(usersArray);
      setAiConversations(conversations);
      setConversationCorrections(correctionsMap);
    } catch (error) {
      console.error('❌ Error loading GM users:', error);
      alert('Eroare la încărcarea userilor: ' + error.message);
    } finally {
      setLoadingConversations(false);
    }
  };

  // Load conversations for selected user
  const loadUserConversations = (user) => {
    setSelectedUser(user);
    setUserConversations(user.conversations);
  };

  // Open correction modal
  const openCorrectionModal = (conversation) => {
    setSelectedConversation(conversation);
    
    // Dacă există corecție, încarcă-o
    const existingCorrection = conversationCorrections[conversation.id];
    if (existingCorrection) {
      setCorrectedResponse(existingCorrection.correctedResponse);
      setCorrectionPrompt(existingCorrection.correctionPrompt || '');
    } else {
      setCorrectedResponse(conversation.aiResponse);
      setCorrectionPrompt('');
    }
    
    setCorrectionModal(true);
  };

  // Save correction
  const saveCorrection = async () => {
    if (!correctedResponse.trim()) {
      alert('Te rog să scrii răspunsul corect!');
      return;
    }

    setSavingCorrection(true);
    try {
      const existingCorrection = conversationCorrections[selectedConversation.id];
      
      if (existingCorrection) {
        // Update corecție existentă
        const correctionRef = doc(db, 'aiCorrections', existingCorrection.id);
        const updateData = {
          correctedResponse: correctedResponse.trim(),
          correctionPrompt: correctionPrompt.trim(),
          correctedBy: currentUser.uid,
          correctedByEmail: currentUser.email,
          correctedAt: serverTimestamp(),
          applied: false
        };
        
        await updateDoc(correctionRef, updateData);

        // Actualizează state-ul local
        setConversationCorrections(prev => ({
          ...prev,
          [selectedConversation.id]: {
            ...existingCorrection,
            ...updateData,
            correctedAt: new Date()
          }
        }));

        alert('✅ Corecție actualizată cu succes!');
      } else {
        // Creează corecție nouă
        const correctionData = {
          conversationId: selectedConversation.id,
          originalResponse: selectedConversation.aiResponse,
          correctedResponse: correctedResponse.trim(),
          correctionPrompt: correctionPrompt.trim(),
          correctedBy: currentUser.uid,
          correctedByEmail: currentUser.email,
          correctedAt: serverTimestamp(),
          applied: false
        };
        
        const docRef = await addDoc(collection(db, 'aiCorrections'), correctionData);

        // Actualizează state-ul local
        setConversationCorrections(prev => ({
          ...prev,
          [selectedConversation.id]: {
            id: docRef.id,
            ...correctionData,
            correctedAt: new Date()
          }
        }));

        alert('✅ Corecție salvată cu succes!');
      }
      setCorrectionModal(false);
      setSelectedConversation(null);
      setCorrectedResponse('');
      setCorrectionPrompt('');
    } catch (error) {
      console.error('Error saving correction:', error);
      alert('❌ Eroare la salvarea corecției: ' + error.message);
    } finally {
      setSavingCorrection(false);
    }
  };

  // Load Admin KYC submissions
  const loadKycSubmissions = async () => {
    setLoadingAdmin(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('status', '==', 'pendingApproval')
      );
      const snapshot = await getDocs(q);
      const submissions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setKycSubmissions(submissions);
    } catch (error) {
      console.error('Error loading KYC submissions:', error);
    } finally {
      setLoadingAdmin(false);
    }
  };

  // Load AI Conversations
  const loadAiConversations = async () => {
    setLoadingAdmin(true);
    try {
      const q = query(
        collection(db, 'aiConversations'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAiConversations(conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoadingAdmin(false);
    }
  };

  // Approve KYC
  const handleApproveKyc = async (userId) => {
    if (!confirm('Aprobi această cerere KYC?')) return;
    
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'approved',
        kycStatus: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: currentUser.uid
      });
      
      alert('✅ KYC aprobat cu succes!');
      loadKycSubmissions();
    } catch (error) {
      console.error('Error approving KYC:', error);
      alert('❌ Eroare la aprobare: ' + error.message);
    }
  };

  // Reject KYC
  const handleRejectKyc = async (userId) => {
    const reason = prompt('Motiv respingere:');
    if (!reason) return;
    
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'rejected',
        kycStatus: 'rejected',
        rejectionReason: reason,
        rejectedAt: serverTimestamp(),
        rejectedBy: currentUser.uid
      });
      
      alert('✅ KYC respins!');
      loadKycSubmissions();
    } catch (error) {
      console.error('Error rejecting KYC:', error);
      alert('❌ Eroare la respingere: ' + error.message);
    }
  };

  // Load GM Performance Metrics
  const loadPerformanceMetrics = async () => {
    setLoadingGM(true);
    try {
      // Get latest performance metrics
      const metricsQuery = query(
        collection(db, 'performanceMetrics'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      const metricsSnapshot = await getDocs(metricsQuery);
      
      if (!metricsSnapshot.empty) {
        setPerformanceMetrics(metricsSnapshot.docs[0].data());
      }
      
      // Get active alerts
      const alertsQuery = query(
        collection(db, 'performanceAlerts'),
        where('resolved', '==', false),
        orderBy('createdAt', 'desc')
      );
      const alertsSnapshot = await getDocs(alertsQuery);
      const alertsList = alertsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAlerts(alertsList);
    } catch (error) {
      console.error('Error loading performance metrics:', error);
    } finally {
      setLoadingGM(false);
    }
  };

  // Resolve Alert
  const handleResolveAlert = async (alertId) => {
    try {
      await updateDoc(doc(db, 'performanceAlerts', alertId), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid
      });
      
      loadPerformanceMetrics();
    } catch (error) {
      console.error('Error resolving alert:', error);
      alert('❌ Eroare la rezolvare: ' + error.message);
    }
  };

  const loadStats = async () => {
    try {
      const isAdmin = currentUser?.email === 'ursache.andrei1995@gmail.com';

      // Evenimente
      const evSnapshot = await getDocs(collection(db, 'evenimente'));
      const evenimente = evSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const evenimenteNealocate = evenimente.filter(ev => {
        const staffAlocat = ev.staffAlocat || [];
        return staffAlocat.length === 0;
      });

      // Staff
      const staffSnapshot = await getDocs(
        query(collection(db, 'users'), where('status', '==', 'approved'))
      );

      // Evenimente astăzi
      const today = new Date().toISOString().split('T')[0];
      const evenimenteAstazi = evenimente.filter(ev => {
        const evDate = ev.data || ev.dataStart;
        return evDate === today;
      });

      // KYC Pending (doar admin)
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
        evenimenteNealocate: evenimenteNealocate.length,
        staffTotal: staffSnapshot.size,
        kycPending
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };



  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  // Scroll la ultimul mesaj
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  // Funcție pentru a obține context despre user
  const getUserContext = async () => {
    try {
      const context = {
        user: {
          email: currentUser?.email,
          nume: staffProfile?.nume || 'Necunoscut',
          code: staffProfile?.code
        },
        stats: stats,
        isAdmin: currentUser?.email === 'ursache.andrei1995@gmail.com'
      };

      // Încarcă evenimente user
      const evQuery = query(
        collection(db, 'evenimente'),
        where('staffAlocat', 'array-contains', currentUser.uid)
      );
      const evSnapshot = await getDocs(evQuery);
      context.evenimenteUser = evSnapshot.docs.map(doc => ({
        nume: doc.data().nume,
        data: doc.data().data,
        locatie: doc.data().locatie,
        rol: doc.data().rol
      }));

      return context;
    } catch (error) {
      console.error('Error getting context:', error);
      return null;
    }
  };

  // Procesează comenzi directe
  const processCommand = async (message) => {
    const lowerMsg = message.toLowerCase();

    // Comandă GM Mode
    if (lowerMsg === 'gm' || lowerMsg === 'g m' || lowerMsg.includes('modul gm')) {
      setGmMode(true);
      setCurrentView('gm-conversations');
      return '🎮 Modul GM activat! Vezi conversațiile userilor în panoul din stânga.';
    }

    // Comandă alocare AI
    if (lowerMsg.includes('alocă') || lowerMsg.includes('aloca')) {
      // Extrage date din mesaj (ex: "alocă evenimente din 1 ianuarie până la 31 ianuarie")
      const dateMatch = lowerMsg.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\s+\w+)/g);
      
      if (!dateMatch || dateMatch.length < 2) {
        return 'Te rog să specifici intervalul de date. Exemplu: "Alocă evenimente din 2024-01-01 până la 2024-01-31"';
      }

      try {
        // Încarcă evenimente nealocate
        const evSnapshot = await getDocs(collection(db, 'evenimente'));
        const evenimente = evSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const nealocate = evenimente.filter(ev => !ev.staffAlocat || ev.staffAlocat.length === 0);

        if (nealocate.length === 0) {
          return '✅ Nu există evenimente nealocate!';
        }

        // Încarcă staff disponibil
        const staffSnapshot = await getDocs(
          query(collection(db, 'users'), where('status', '==', 'approved'))
        );
        const staffList = staffSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Încarcă disponibilități
        const dispSnapshot = await getDocs(collection(db, 'disponibilitati'));
        const disponibilitati = dispSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let alocate = 0;

        // Algoritm de alocare
        for (const eveniment of nealocate) {
          const dataEv = eveniment.data || eveniment.dataStart;
          const nrStaffNecesar = eveniment.nrStaffNecesar || 1;
          
          // Filtrează staff disponibil
          const staffDisponibil = staffList.filter(staff => {
            const esteDisponibil = disponibilitati.some(disp => {
              if (disp.userId !== staff.uid) return false;
              if (disp.tipDisponibilitate === 'indisponibil') return false;
              return dataEv >= disp.dataStart && dataEv <= disp.dataEnd;
            });

            const areConflict = evenimente.some(ev => {
              if (ev.id === eveniment.id) return false;
              if (!ev.staffAlocat || !ev.staffAlocat.includes(staff.uid)) return false;
              const dataAltEv = ev.data || ev.dataStart;
              return dataAltEv === dataEv;
            });

            return esteDisponibil && !areConflict;
          });

          // Prioritizează preferințe
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
            
            if (prefA && !prefB) return -1;
            if (!prefA && prefB) return 1;
            return 0;
          });

          // Alocă staff
          const staffAlocat = staffDisponibil.slice(0, nrStaffNecesar).map(s => s.uid);

          if (staffAlocat.length > 0) {
            await updateDoc(doc(db, 'evenimente', eveniment.id), {
              staffAlocat,
              dataAlocare: new Date(),
              alocatDe: 'AI Chat'
            });
            alocate++;
          }
        }

        return `✅ Alocare completă! Am alocat ${alocate} din ${nealocate.length} evenimente. Vezi rezultatele în pagina Evenimente.`;
      } catch (error) {
        console.error('Error in alocare:', error);
        return '❌ Eroare la alocare: ' + error.message;
      }
    }

    // Comenzi de navigare
    if (lowerMsg.includes('evenimente') && (lowerMsg.includes('arată') || lowerMsg.includes('vezi'))) {
      navigate('/evenimente');
      return 'Te-am dus la Evenimente.';
    }

    if (lowerMsg.includes('disponibilitate')) {
      navigate('/disponibilitate');
      return 'Te-am dus la Disponibilitate.';
    }

    if (lowerMsg.includes('salarizare') || lowerMsg.includes('salarii')) {
      navigate('/salarizare');
      return 'Te-am dus la Salarizare.';
    }

    if (lowerMsg.includes('șoferi') || lowerMsg.includes('soferi')) {
      navigate('/soferi');
      return 'Te-am dus la Management Șoferi.';
    }

    if (lowerMsg.includes('admin')) {
      const user = auth.currentUser;
      
      if (!user) {
        return '⏳ Se încarcă datele utilizatorului... Încearcă din nou în câteva secunde.';
      }
      
      if (!currentUser) {
        setCurrentUser(user);
      }
      
      const userEmail = user.email?.trim().toLowerCase();
      const adminEmail = 'ursache.andrei1995@gmail.com';
      
      if (userEmail === adminEmail) {
        setAdminMode(true);
        setCurrentView('admin-kyc');
        return '✅ Mod Admin activat! Verifică sidebar-ul - ai acum acces la:\n• 👥 Admin KYC\n• 💬 Conversații AI\n\n💡 Pentru a ieși din modul admin, apasă "Ieși din Admin" din sidebar.';
      } else {
        return '⛔ Acces interzis. Doar administratorul poate accesa Admin Panel.';
      }
    }
    
    if (lowerMsg.includes('gm')) {
      const user = auth.currentUser;
      
      if (!user) {
        return '⏳ Se încarcă datele utilizatorului... Încearcă din nou în câteva secunde.';
      }
      
      if (!currentUser) {
        setCurrentUser(user);
      }
      
      const userEmail = user.email?.trim().toLowerCase();
      const adminEmail = 'ursache.andrei1995@gmail.com';
      
      if (userEmail === adminEmail) {
        setGmMode(true);
        setCurrentView('gm-overview');
        return '✅ Mod GM activat! Verifică sidebar-ul - ai acum acces la:\n• 🎮 GM Overview\n• 📊 Analytics\n\n💡 Pentru a ieși din modul GM, apasă "Ieși din GM" din sidebar.';
      } else {
        return '⛔ Acces interzis. Doar administratorul poate accesa GM Mode.';
      }
    }

    // Comenzi info
    if (lowerMsg.includes('câte evenimente') || lowerMsg.includes('cate evenimente')) {
      return `Ai ${stats.evenimenteTotal} evenimente în total, din care ${stats.evenimenteAstazi} astăzi.`;
    }

    if (lowerMsg.includes('câți staff') || lowerMsg.includes('cati staff')) {
      return `Sunt ${stats.staffTotal} membri staff activi.`;
    }

    // Comenzi performanță
    if (lowerMsg.includes('performanță') || lowerMsg.includes('performanta') || 
        lowerMsg.includes('task') || lowerMsg.includes('cum merg')) {
      return await getMyPerformance();
    }

    return null; // Nu e comandă directă
  };

  const getMyPerformance = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const perfDoc = await getDoc(doc(db, 'performanceMetrics', `${currentUser.uid}_${today}`));
      
      if (!perfDoc.exists()) {
        return 'Nu am date de performanță pentru astăzi. Sistemul de monitorizare va genera raportul în curând.';
      }
      
      const perf = perfDoc.data();
      
      const scoreEmoji = perf.overallScore >= 90 ? '🟢' : 
                         perf.overallScore >= 70 ? '🟡' : 
                         perf.overallScore >= 50 ? '🟠' : '🔴';
      
      const trendEmoji = perf.trend === 'up' ? '📈' : 
                         perf.trend === 'down' ? '📉' : '➡️';
      
      return `${scoreEmoji} **Performance Score: ${perf.overallScore}/100**

📊 Detalii:
• Task-uri: ${perf.tasksCompleted}/${perf.tasksAssigned} (${perf.completionRate}%)
• Calitate: ${perf.qualityScore}/100
• Punctualitate: ${perf.punctualityScore}/100
• Conformitate: ${perf.complianceScore}/100

${trendEmoji} Trend: ${perf.trend} (${perf.trendPercentage > 0 ? '+' : ''}${perf.trendPercentage}%)

${perf.tasksOverdue > 0 ? `⚠️ Ai ${perf.tasksOverdue} task-uri în întârziere!` : '✅ Toate task-urile la zi!'}`;
    } catch (error) {
      console.error('Error fetching performance:', error);
      return 'Eroare la încărcarea datelor de performanță.';
    }
  };

  // Trimite mesaj la OpenAI
  const handleSendMessage = async () => {
    if (!inputMessage.trim() && selectedImages.length === 0) return;

    const userMessage = inputMessage.trim();
    const images = selectedImages;
    
    setInputMessage('');
    setSelectedImages([]);
    
    // Adaugă mesaj user cu preview imagini
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userMessage,
      images: images.map(img => img.preview)
    }]);

    // Verifică comenzi directe (doar dacă nu sunt imagini)
    if (images.length === 0) {
      const commandResponse = await processCommand(userMessage);
      if (commandResponse) {
        setMessages(prev => [...prev, { role: 'assistant', content: commandResponse }]);
        return;
      }
    }

    setChatLoading(true);

    try {
      const context = await getUserContext();

      if (images.length > 0) {
        // Upload imagini și validare cu Object Gatekeeper
        const imageUrls = await uploadImagesToStorage(images);
        const meta = createMetaLine(images);
        const documentType = determineDocumentType(userMessage);
        
        const result = await callAIManager({
          action: 'validate_image',
          message: userMessage,
          imageUrls,
          meta,
          documentType,
          userContext: context
        });

        if (result.data.success) {
          displayValidationResult(result.data);
        } else {
          throw new Error('Image validation failed');
        }
        
      } else {
        // Chat normal fără imagini
        const result = await callChatWithAI({
          messages: [
            ...messages.slice(-10),
            { role: 'user', content: userMessage }
          ],
          userContext: context
        });

        if (result.data.success) {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: result.data.message 
          }]);
        } else {
          throw new Error('AI response failed');
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      
      let errorMessage = 'Eroare la comunicarea cu AI. Încearcă din nou.';
      
      if (error.code === 'unauthenticated') {
        errorMessage = 'Trebuie să fii autentificat pentru a folosi AI.';
      } else if (error.code === 'resource-exhausted') {
        errorMessage = 'Limită de utilizare atinsă. Încearcă din nou mai târziu.';
      } else if (error.code === 'failed-precondition') {
        errorMessage = 'Serviciul AI nu este configurat corect. Contactează administratorul.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Serviciul AI este temporar indisponibil. Încearcă din nou.';
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Speech to text
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Browser-ul tău nu suportă recunoaștere vocală. Încearcă Chrome.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'ro-RO';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      alert('Eroare la recunoaștere vocală: ' + event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Image upload handlers
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      if (selectedImages.length >= 3) {
        alert('Poți încărca maxim 3 imagini simultan');
        break;
      }
      
      if (file.size > 3 * 1024 * 1024) {
        alert(`${file.name} este prea mare (max 3MB). Comprimă imaginea și încearcă din nou.`);
        continue;
      }
      
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        alert(`${file.name} nu este format valid. Folosește JPG, PNG sau WEBP.`);
        continue;
      }
      
      const preview = URL.createObjectURL(file);
      setSelectedImages(prev => [...prev, { 
        file, 
        preview, 
        size: file.size,
        name: file.name,
        type: file.type
      }]);
    }
    
    e.target.value = '';
  };

  const removeImage = (index) => {
    setSelectedImages(prev => {
      const newImages = prev.filter((_, idx) => idx !== index);
      URL.revokeObjectURL(prev[index].preview);
      return newImages;
    });
  };

  const uploadImagesToStorage = async (images) => {
    const uploadPromises = images.map(async (img, index) => {
      const timestamp = Date.now();
      const fileName = `${timestamp}_${index}_${img.name}`;
      const storageRef = ref(storage, `ai-validations/${currentUser.uid}/${fileName}`);
      
      await uploadBytes(storageRef, img.file);
      const url = await getDownloadURL(storageRef);
      
      return url;
    });
    
    return await Promise.all(uploadPromises);
  };

  const createMetaLine = (images) => {
    const imageSizes = images.map(img => (img.size / 1024 / 1024).toFixed(2));
    const hasLargeImage = images.some(img => img.size > 3 * 1024 * 1024);
    
    return `META has_image=true; image_count=${images.length}; image_size_mb=[${imageSizes.join(',')}]; user_says_over_3mb=${hasLargeImage}; user_priority=quality`;
  };

  const determineDocumentType = (message) => {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('ci') || lowerMsg.includes('carte') || lowerMsg.includes('identitate')) {
      return 'CI';
    }
    if (lowerMsg.includes('permis')) {
      return 'permis';
    }
    if (lowerMsg.includes('cazier')) {
      return 'cazier';
    }
    if (lowerMsg.includes('eveniment') || lowerMsg.includes('poză') || lowerMsg.includes('poza')) {
      return 'eveniment';
    }
    if (lowerMsg.includes('raport')) {
      return 'raport';
    }
    if (lowerMsg.includes('factură') || lowerMsg.includes('factura') || lowerMsg.includes('bon')) {
      return 'factura';
    }
    
    return 'unknown';
  };

  const displayValidationResult = (data) => {
    const { validation, message: answerText } = data;
    const { overall_decision, per_image, need_user_action } = validation;
    
    let icon = '';
    let statusText = '';
    
    switch (overall_decision) {
      case 'ACCEPT':
        icon = '✅';
        statusText = 'Document acceptat!';
        break;
      case 'REJECT':
        icon = '❌';
        statusText = 'Document respins';
        break;
      case 'REVIEW':
        icon = '⚠️';
        statusText = 'Document necesită verificare';
        break;
      default:
        icon = '❓';
        statusText = 'Nu pot procesa documentul';
    }
    
    let fullMessage = `${icon} **${statusText}**\n\n${answerText}`;
    
    // Adaugă detalii per imagine dacă există
    if (per_image && per_image.length > 0) {
      fullMessage += '\n\n📋 Detalii per imagine:';
      per_image.forEach((img, idx) => {
        const imgIcon = img.app_decision === 'ACCEPT' ? '✅' : 
                       img.app_decision === 'REJECT' ? '❌' : 
                       img.app_decision === 'REVIEW' ? '⚠️' : '❓';
        fullMessage += `\n${idx + 1}. ${imgIcon} ${img.app_decision}`;
        
        if (img.detected_objects && img.detected_objects.length > 0) {
          const objects = img.detected_objects
            .filter(o => o.label !== 'UNKNOWN_RELEVANT')
            .map(o => o.label)
            .join(', ');
          if (objects) {
            fullMessage += `\n   Detectat: ${objects}`;
          }
        }
        
        if (img.image_quality && img.image_quality !== 'unknown') {
          fullMessage += `\n   Calitate: ${img.image_quality}`;
        }
      });
    }
    
    // Adaugă acțiune necesară
    if (need_user_action && need_user_action !== 'none') {
      fullMessage += `\n\n📌 Acțiune necesară: ${translateAction(need_user_action)}`;
    }
    
    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: fullMessage,
      validationResult: validation
    }]);
  };

  const translateAction = (action) => {
    const translations = {
      'upload_image': 'Încarcă imaginea',
      'compress_to_3mb': 'Comprimă imaginea sub 3MB',
      'crop_zoom': 'Fă crop/zoom pe zona relevantă',
      'better_photo': 'Fă o poză mai bună (lumină, focus, unghi perpendicular)',
      'clarify_question': 'Clarifică cererea',
      'provide_app_rules': 'Specifică tipul documentului'
    };
    return translations[action] || action;
  };

  const handleClearChat = async () => {
    if (!confirm('Ștergi istoricul conversației? (Se va salva în sistem pentru admin)')) return;

    try {
      const conversationHistory = messages.filter(m => m.role !== 'assistant' || m.content !== 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?');
      
      if (conversationHistory.length > 0) {
        await addDoc(collection(db, 'aiConversations'), {
          userId: currentUser.uid,
          userEmail: currentUser.email,
          userName: staffProfile?.nume || currentUser.displayName || 'Unknown',
          conversationHistory: conversationHistory,
          clearedAt: serverTimestamp(),
          messageCount: conversationHistory.length,
          type: 'cleared_by_user'
        });
      }

      setMessages([{ role: 'assistant', content: 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?' }]);
      localStorage.removeItem('chat_history');
    } catch (error) {
      console.error('Error saving conversation:', error);
      setMessages([{ role: 'assistant', content: 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?' }]);
      localStorage.removeItem('chat_history');
    }
  };

  return (
    <div className="home-clean">
      {/* Sidebar stânga */}
      <div 
        className={`sidebar-left ${sidebarOpen ? 'open' : ''}`}
        ref={sidebarRef}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      >
        <div className="sidebar-content">
          <div className="sidebar-header">
            <h3>Meniu</h3>
          </div>
          <nav className="sidebar-nav">
            <button 
              onClick={() => {
                setCurrentView('dashboard');
                navigate('/home');
              }} 
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            >
              <span className="nav-icon">🏠</span>
              <span className="nav-text">Acasă</span>
            </button>
            <button onClick={() => navigate('/evenimente')} className="nav-item">
              <span className="nav-icon">📅</span>
              <span className="nav-text">Evenimente</span>
            </button>
            <button onClick={() => navigate('/disponibilitate')} className="nav-item">
              <span className="nav-icon">🗓️</span>
              <span className="nav-text">Disponibilitate</span>
            </button>
            <button onClick={() => navigate('/salarizare')} className="nav-item">
              <span className="nav-icon">💰</span>
              <span className="nav-text">Salarizare</span>
            </button>
            <button onClick={() => navigate('/soferi')} className="nav-item">
              <span className="nav-icon">🚗</span>
              <span className="nav-text">Șoferi</span>
            </button>
            
            {/* Admin Mode - Apare doar când e activat */}
            {adminMode && currentUser?.email === 'ursache.andrei1995@gmail.com' && (
              <>
                <div style={{ borderTop: '1px solid #334155', margin: '0.5rem 0', opacity: 0.3 }}></div>
                <button 
                  onClick={() => setCurrentView('admin-kyc')} 
                  className={`nav-item nav-item-admin ${currentView === 'admin-kyc' ? 'active' : ''}`}
                >
                  <span className="nav-icon">👥</span>
                  <span className="nav-text">Admin KYC</span>
                </button>
                <button 
                  onClick={() => {
                    setAdminMode(false);
                    setCurrentView('dashboard');
                  }} 
                  className="nav-item nav-item-exit-admin"
                  style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
                >
                  <span className="nav-icon">🚪</span>
                  <span className="nav-text">Ieși din Admin</span>
                </button>
              </>
            )}
            
            {/* GM Mode - Apare doar când e activat */}
            {gmMode && (
              <>
                <div style={{ borderTop: '1px solid #10b981', margin: '0.5rem 0', opacity: 0.5 }}></div>
                <button 
                  onClick={() => setCurrentView('gm-conversations')} 
                  className={`nav-item ${currentView === 'gm-conversations' ? 'active' : ''}`}
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <span className="nav-icon">💬</span>
                  <span className="nav-text">Conversații AI</span>
                </button>
                <button 
                  onClick={() => navigate('/chat-clienti')} 
                  className="nav-item"
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <span className="nav-icon">📱</span>
                  <span className="nav-text">Chat Clienti</span>
                </button>
                <button 
                  onClick={() => navigate('/centrala-telefonica')} 
                  className="nav-item"
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <span className="nav-icon">📞</span>
                  <span className="nav-text">Centrala Telefonică</span>
                </button>
                <button 
                  onClick={() => setCurrentView('gm-overview')} 
                  className={`nav-item ${currentView === 'gm-overview' ? 'active' : ''}`}
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <span className="nav-icon">🎮</span>
                  <span className="nav-text">GM Overview</span>
                </button>
                <button 
                  onClick={() => setCurrentView('gm-analytics')} 
                  className={`nav-item ${currentView === 'gm-analytics' ? 'active' : ''}`}
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <span className="nav-icon">📊</span>
                  <span className="nav-text">Analytics</span>
                </button>
                <button 
                  onClick={() => {
                    setGmMode(false);
                    setCurrentView('dashboard');
                  }} 
                  className="nav-item"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                >
                  <span className="nav-icon">🚪</span>
                  <span className="nav-text">Ieși din GM</span>
                </button>
              </>
            )}
            
            {currentUser?.email === 'ursache.andrei1995@gmail.com' && (
              <button onClick={() => navigate('/settings')} className="nav-item">
                <span className="nav-icon">⚙️</span>
                <span className="nav-text">Setări</span>
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* Navbar sus */}
      <nav className="navbar-clean">
        <div className="nav-content">
          <h1>SuperParty</h1>
          <div className="nav-right">
            {/* Admin Mode Indicator */}
            {adminMode && currentUser?.email === 'ursache.andrei1995@gmail.com' && (
              <span 
                style={{
                  padding: '0.5rem 1rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  marginRight: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                👨‍💼 Mod Admin
              </span>
            )}
            
            {/* GM Mode Indicator */}
            {gmMode && currentUser?.email === 'ursache.andrei1995@gmail.com' && (
              <span 
                style={{
                  padding: '0.5rem 1rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  marginRight: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                🎮 Mod GM
              </span>
            )}
            <button className="theme-toggle-nav" onClick={toggleTheme} title="Schimbă tema">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <span className="user-email">{currentUser?.email}</span>
            <button className="btn-signout" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </nav>

      {/* Conținut principal */}
      <div className="home-content-clean">
        <div className="dashboard-container">
          {/* Conditional rendering based on currentView */}
          {currentView === 'admin-kyc' && adminMode ? (
            <div>
              <h2 style={{ marginBottom: '2rem', fontSize: '1.875rem', fontWeight: '700' }}>
                👥 Admin KYC - Aprobări Pending
              </h2>
              
              <button 
                onClick={loadKycSubmissions}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: '600',
                  marginBottom: '1.5rem'
                }}
              >
                🔄 Reîmprospătează
              </button>

              {loadingAdmin ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner"></div>
                  <p>Se încarcă cererile KYC...</p>
                </div>
              ) : kycSubmissions.length === 0 ? (
                <p style={{ padding: '2rem', background: '#1e293b', borderRadius: '0.5rem', textAlign: 'center' }}>
                  ✅ Nu există cereri KYC pending
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {kycSubmissions.map(submission => (
                    <div 
                      key={submission.id}
                      style={{
                        padding: '1.5rem',
                        background: '#1e293b',
                        borderRadius: '0.5rem',
                        border: '1px solid #334155'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            {submission.firstName} {submission.lastName}
                          </h3>
                          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                            📧 {submission.email}
                          </p>
                          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                            📱 {submission.phone || 'N/A'}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleApproveKyc(submission.id)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            ✅ Aprobă
                          </button>
                          <button
                            onClick={() => handleRejectKyc(submission.id)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            ❌ Respinge
                          </button>
                        </div>
                      </div>
                      
                      {submission.ciUrl && (
                        <div style={{ marginTop: '1rem' }}>
                          <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                            📄 Documente:
                          </p>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {submission.ciUrl && (
                              <a 
                                href={submission.ciUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: '#334155',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.875rem',
                                  textDecoration: 'none',
                                  color: 'white'
                                }}
                              >
                                🆔 CI
                              </a>
                            )}
                            {submission.permisUrl && (
                              <a 
                                href={submission.permisUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: '#334155',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.875rem',
                                  textDecoration: 'none',
                                  color: 'white'
                                }}
                              >
                                🚗 Permis
                              </a>
                            )}
                            {submission.cazierUrl && (
                              <a 
                                href={submission.cazierUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: '#334155',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.875rem',
                                  textDecoration: 'none',
                                  color: 'white'
                                }}
                              >
                                📋 Cazier
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : currentView === 'admin-conversations' && adminMode ? (
            <div>
              <h2 style={{ marginBottom: '2rem', fontSize: '1.875rem', fontWeight: '700' }}>
                💬 Conversații AI - Istoric
              </h2>
              
              <button 
                onClick={loadAiConversations}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: '600',
                  marginBottom: '1.5rem'
                }}
              >
                🔄 Reîmprospătează
              </button>

              {loadingAdmin ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner"></div>
                  <p>Se încarcă conversațiile...</p>
                </div>
              ) : aiConversations.length === 0 ? (
                <p style={{ padding: '2rem', background: '#1e293b', borderRadius: '0.5rem', textAlign: 'center' }}>
                  📭 Nu există conversații salvate
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {aiConversations.map(conv => (
                    <div 
                      key={conv.id}
                      style={{
                        padding: '1.5rem',
                        background: '#1e293b',
                        borderRadius: '0.5rem',
                        border: '1px solid #334155'
                      }}
                    >
                      <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                          {conv.userName || 'Unknown User'}
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                          📧 {conv.userEmail}
                        </p>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                          🕐 {conv.clearedAt?.toDate?.()?.toLocaleString('ro-RO') || conv.timestamp?.toDate?.()?.toLocaleString('ro-RO') || 'N/A'}
                        </p>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                          💬 {conv.messageCount || conv.conversationHistory?.length || 0} mesaje
                        </p>
                      </div>
                      
                      {conv.conversationHistory && conv.conversationHistory.length > 0 && (
                        <details style={{ marginTop: '1rem' }}>
                          <summary style={{ cursor: 'pointer', color: '#667eea', fontWeight: '600' }}>
                            Vezi conversația
                          </summary>
                          <div style={{ marginTop: '1rem', maxHeight: '300px', overflowY: 'auto', padding: '1rem', background: '#0f172a', borderRadius: '0.375rem' }}>
                            {conv.conversationHistory.map((msg, idx) => (
                              <div key={idx} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: idx < conv.conversationHistory.length - 1 ? '1px solid #334155' : 'none' }}>
                                <p style={{ fontWeight: '600', color: msg.role === 'user' ? '#10b981' : '#667eea', marginBottom: '0.5rem' }}>
                                  {msg.role === 'user' ? '👤 User' : '🤖 AI'}
                                </p>
                                <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                                  {msg.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : currentView === 'gm-overview' && gmMode ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.875rem', fontWeight: '700' }}>
                  🎮 GM Overview - Control Panel
                </h2>
                <button 
                  onClick={loadPerformanceMetrics}
                  disabled={loadingGM}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: loadingGM ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    opacity: loadingGM ? 0.6 : 1
                  }}
                >
                  {loadingGM ? '⏳ Se încarcă...' : '🔄 Reîmprospătează'}
                </button>
              </div>

              {loadingGM ? (
                <div style={{ textAlign: 'center', padding: '3rem', fontSize: '1.2rem', color: '#64748b' }}>
                  ⏳ Se încarcă datele...
                </div>
              ) : (
                <>
                  {/* Performance Metrics Dashboard */}
                  {performanceMetrics ? (
                    <div style={{ marginBottom: '2rem' }}>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>
                        📊 Metrici de Performanță
                      </h3>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                        gap: '1.5rem',
                        marginBottom: '2rem'
                      }}>
                        {/* Accuracy */}
                        <div style={{
                          background: '#1e293b',
                          padding: '1.5rem',
                          borderRadius: '0.75rem',
                          border: '1px solid #334155'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                            🎯 Acuratețe
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#10b981' }}>
                            {performanceMetrics.accuracy?.toFixed(1) || 0}%
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                            Țintă: ≥85%
                          </div>
                        </div>

                        {/* Response Time */}
                        <div style={{
                          background: '#1e293b',
                          padding: '1.5rem',
                          borderRadius: '0.75rem',
                          border: '1px solid #334155'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                            ⚡ Timp Răspuns
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>
                            {performanceMetrics.avgResponseTime?.toFixed(0) || 0}ms
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                            Țintă: ≤3000ms
                          </div>
                        </div>

                        {/* Error Rate */}
                        <div style={{
                          background: '#1e293b',
                          padding: '1.5rem',
                          borderRadius: '0.75rem',
                          border: '1px solid #334155'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                            ❌ Rată Erori
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ef4444' }}>
                            {performanceMetrics.errorRate?.toFixed(1) || 0}%
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                            Țintă: ≤5%
                          </div>
                        </div>

                        {/* Total Validations */}
                        <div style={{
                          background: '#1e293b',
                          padding: '1.5rem',
                          borderRadius: '0.75rem',
                          border: '1px solid #334155'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                            📈 Total Validări
                          </div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#8b5cf6' }}>
                            {performanceMetrics.totalValidations || 0}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                            Ultimele 24h
                          </div>
                        </div>
                      </div>

                      {/* Last Update */}
                      <div style={{ fontSize: '0.875rem', color: '#64748b', textAlign: 'right' }}>
                        Ultima actualizare: {performanceMetrics.timestamp?.toDate?.()?.toLocaleString('ro-RO') || 'N/A'}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '2rem',
                      background: '#1e293b',
                      borderRadius: '0.75rem',
                      border: '1px solid #334155',
                      textAlign: 'center',
                      marginBottom: '2rem'
                    }}>
                      <p style={{ fontSize: '1.1rem', color: '#94a3b8' }}>
                        📊 Nu există date de performanță disponibile
                      </p>
                      <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Apasă "Reîmprospătează" pentru a încărca datele
                      </p>
                    </div>
                  )}

                  {/* Active Alerts */}
                  <div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>
                      🚨 Alerte Active ({alerts.length})
                    </h3>
                    
                    {alerts.length === 0 ? (
                      <div style={{
                        padding: '2rem',
                        background: '#1e293b',
                        borderRadius: '0.75rem',
                        border: '1px solid #334155',
                        textAlign: 'center'
                      }}>
                        <p style={{ fontSize: '1.1rem', color: '#10b981' }}>
                          ✅ Nu există alerte active
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                          Toate sistemele funcționează normal
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {alerts.map(alert => (
                          <div 
                            key={alert.id}
                            style={{
                              padding: '1.5rem',
                              background: '#1e293b',
                              borderRadius: '0.75rem',
                              border: `2px solid ${
                                alert.severity === 'critical' ? '#ef4444' :
                                alert.severity === 'warning' ? '#f59e0b' :
                                '#3b82f6'
                              }`,
                              borderLeft: `6px solid ${
                                alert.severity === 'critical' ? '#ef4444' :
                                alert.severity === 'warning' ? '#f59e0b' :
                                '#3b82f6'
                              }`
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '0.5rem',
                                  marginBottom: '0.5rem'
                                }}>
                                  <span style={{ 
                                    fontSize: '0.75rem', 
                                    fontWeight: '600',
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '0.25rem',
                                    background: alert.severity === 'critical' ? '#ef4444' :
                                               alert.severity === 'warning' ? '#f59e0b' :
                                               '#3b82f6',
                                    color: 'white'
                                  }}>
                                    {alert.severity?.toUpperCase()}
                                  </span>
                                  <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                                    {alert.type}
                                  </span>
                                </div>
                                <p style={{ fontSize: '1rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>
                                  {alert.message}
                                </p>
                                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  🕐 {alert.createdAt?.toDate?.()?.toLocaleString('ro-RO') || 'N/A'}
                                </p>
                              </div>
                              <button
                                onClick={() => handleResolveAlert(alert.id)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.375rem',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  fontWeight: '600',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                ✅ Rezolvă
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : currentView === 'gm-conversations' && gmMode ? (
            <div style={{ display: 'flex', height: 'calc(100vh - 200px)', gap: '1rem' }}>
              {/* Panou lateral cu useri */}
              <div style={{
                width: '300px',
                background: '#1e293b',
                borderRadius: '0.75rem',
                padding: '1rem',
                overflowY: 'auto',
                border: '1px solid #334155'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>👥 Useri</h3>
                  <button
                    onClick={loadGMUsers}
                    disabled={loadingConversations}
                    style={{
                      padding: '0.5rem',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: loadingConversations ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    {loadingConversations ? '⏳' : '🔄'}
                  </button>
                </div>

                {loadingConversations ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    ⏳ Se încarcă...
                  </div>
                ) : gmUsers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.875rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</div>
                    <div style={{ marginBottom: '0.5rem' }}>Niciun user găsit</div>
                    <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                      Conversațiile apar aici după ce userii vorbesc cu AI-ul
                    </div>
                  </div>
                ) : (
                  gmUsers.map(user => (
                    <div
                      key={user.userId}
                      onClick={() => loadUserConversations(user)}
                      style={{
                        padding: '0.75rem',
                        marginBottom: '0.5rem',
                        background: selectedUser?.userId === user.userId ? '#334155' : '#0f172a',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        border: selectedUser?.userId === user.userId ? '2px solid #10b981' : '1px solid #1e293b',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                        {user.userName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                        {user.userEmail}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        💬 {user.conversations.length} conversații
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Panou principal cu conversații */}
              <div style={{
                flex: 1,
                background: '#1e293b',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                overflowY: 'auto',
                border: '1px solid #334155'
              }}>
                {!selectedUser ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👈</div>
                    <div style={{ fontSize: '1.2rem' }}>Selectează un user din stânga</div>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid #334155' }}>
                      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                        💬 Conversații: {selectedUser.userName}
                      </h2>
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                        {selectedUser.userEmail} • {userConversations.length} conversații
                      </div>
                    </div>

                    {/* Conversații organizate pe zile */}
                    {(() => {
                      // Grupează conversații pe zile
                      const conversationsByDate = {};
                      userConversations.forEach(conv => {
                        const date = conv.timestamp?.toLocaleDateString('ro-RO', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        }) || 'Data necunoscută';
                        if (!conversationsByDate[date]) {
                          conversationsByDate[date] = [];
                        }
                        conversationsByDate[date].push(conv);
                      });

                      return Object.entries(conversationsByDate).map(([date, convs]) => (
                        <div key={date} style={{ marginBottom: '2rem' }}>
                          <div style={{
                            fontSize: '1.125rem',
                            fontWeight: '600',
                            marginBottom: '1rem',
                            color: '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            📅 {date}
                          </div>

                          {convs.map(conv => {
                            const hasCorrection = conversationCorrections[conv.id];
                            return (
                            <div
                              key={conv.id}
                              style={{
                                background: '#0f172a',
                                padding: '1rem',
                                borderRadius: '0.5rem',
                                marginBottom: '1rem',
                                border: hasCorrection ? '2px solid #10b981' : '1px solid #1e293b',
                                position: 'relative'
                              }}
                            >
                              {hasCorrection && (
                                <div style={{
                                  position: 'absolute',
                                  top: '0.5rem',
                                  right: '0.5rem',
                                  background: '#10b981',
                                  color: 'white',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem',
                                  fontWeight: '600'
                                }}>
                                  ✓ Corectat
                                </div>
                              )}
                              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                🕐 {conv.timestamp?.toLocaleTimeString('ro-RO', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                                  ❓ User:
                                </div>
                                <div style={{ color: '#e2e8f0' }}>
                                  {conv.userMessage}
                                </div>
                              </div>

                              <div>
                                <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                                  🤖 AI:
                                </div>
                                <div style={{ color: '#cbd5e1' }}>
                                  {conv.aiResponse}
                                </div>
                              </div>

                              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => openCorrectionModal(conv)}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    background: hasCorrection ? '#0ea5e9' : '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                  }}
                                >
                                  {hasCorrection ? '👁️ Vezi/Editează Corecția' : '✏️ Corectează'}
                                </button>
                                <button
                                  style={{
                                    padding: '0.5rem 1rem',
                                    background: '#334155',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                  }}
                                >
                                  👍 Bun
                                </button>
                                <button
                                  style={{
                                    padding: '0.5rem 1rem',
                                    background: '#334155',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                  }}
                                >
                                  👎 Prost
                                </button>
                              </div>
                            </div>
                          );
                          })}
                        </div>
                      ));
                    })()}
                  </>
                )}
              </div>
            </div>
          ) : currentView === 'gm-analytics' && gmMode ? (
            <div>
              <h2 style={{ marginBottom: '2rem', fontSize: '1.875rem', fontWeight: '700' }}>
                📊 GM Analytics - Statistici Avansate
              </h2>
              <p style={{ fontSize: '1.2rem', color: '#10b981' }}>
                Analize detaliate și rapoarte pentru Game Master.
              </p>
              <p style={{ marginTop: '1rem', padding: '1rem', background: '#1e293b', borderRadius: '0.5rem', borderLeft: '4px solid #10b981' }}>
                🚧 Conținut GM Analytics în curs de integrare...
              </p>
            </div>
          ) : (
            <>
              <h2 style={{ marginBottom: '2rem', fontSize: '1.875rem', fontWeight: '700' }}>
                Bine ai venit, {staffProfile?.nume || currentUser?.email}!
              </h2>

          {/* Stats Cards */}
          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Se încarcă statisticile...</p>
            </div>
          ) : (
            <>
              <div className="dashboard-stats">
                <div className="stat-card" onClick={() => navigate('/evenimente')}>
                  <h3>Evenimente Total</h3>
                  <p>{stats.evenimenteTotal}</p>
                  <span className="stat-subtitle">Vezi toate →</span>
                </div>
                <div className="stat-card" onClick={() => navigate('/evenimente')}>
                  <h3>Evenimente Nealocate</h3>
                  <p>{stats.evenimenteNealocate}</p>
                  <span className="stat-subtitle">Alocă cu AI →</span>
                </div>
                <div className="stat-card">
                  <h3>Staff Activ</h3>
                  <p>{stats.staffTotal}</p>
                  <span className="stat-subtitle">membri aprobați</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div style={{ marginTop: '3rem' }}>
                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '600' }}>
                  Acțiuni Rapide
                </h3>
                <div className="quick-actions">
                  <button onClick={() => navigate('/evenimente')} className="action-card">
                    <span className="action-icon">📅</span>
                    <span className="action-title">Evenimente</span>
                    <span className="action-subtitle">Vezi toate evenimentele</span>
                  </button>
                  <button onClick={() => setChatOpen(true)} className="action-card">
                    <span className="action-icon">🤖</span>
                    <span className="action-title">Alocare AI</span>
                    <span className="action-subtitle">Cere AI-ului să aloce</span>
                  </button>
                  <button onClick={() => navigate('/disponibilitate')} className="action-card">
                    <span className="action-icon">🗓️</span>
                    <span className="action-title">Disponibilitate</span>
                    <span className="action-subtitle">Marchează când ești liber</span>
                  </button>
                  <button onClick={() => navigate('/soferi')} className="action-card">
                    <span className="action-icon">🚗</span>
                    <span className="action-title">Șoferi</span>
                    <span className="action-subtitle">Management șoferi</span>
                  </button>
                </div>
              </div>
            </>
          )}
            </>
          )}
        </div>
      </div>

      {/* Robot AI dreapta jos */}
      <div className="ai-chat-container">
        {chatOpen && (
          <div className="chat-window">
            <div className="chat-header">
              <h4>🤖 Asistent AI</h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="chat-clear-btn" 
                  onClick={handleClearChat}
                  title="Șterge istoric"
                >
                  🗑️
                </button>
                <button className="chat-close" onClick={() => setChatOpen(false)}>✕</button>
              </div>
            </div>
            <div className="chat-messages" ref={chatMessagesRef}>
              {messages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.role === 'user' ? 'user' : 'bot'}`}>
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="chat-message bot">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Image preview */}
            {selectedImages.length > 0 && (
              <div className="chat-image-preview">
                {selectedImages.map((img, idx) => (
                  <div key={idx} className="preview-item">
                    <img src={img.preview} alt={`Preview ${idx + 1}`} />
                    <span className="image-size">{(img.size / 1024 / 1024).toFixed(2)} MB</span>
                    <button className="remove-image" onClick={() => removeImage(idx)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="chat-input-container">
              <input 
                type="file" 
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <button 
                className="chat-image-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={chatLoading || selectedImages.length >= 3}
                title="Încarcă imagine (max 3MB)"
              >
                📷
              </button>
              <button 
                className="chat-voice-btn"
                onClick={handleVoiceInput}
                disabled={isListening}
                title="Comandă vocală"
              >
                {isListening ? '🔴' : '🎤'}
              </button>
              <input 
                type="text" 
                placeholder="Scrie un mesaj sau folosește vocea..." 
                className="chat-input"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={chatLoading}
              />
              <button 
                className="chat-send"
                onClick={handleSendMessage}
                disabled={chatLoading || (!inputMessage.trim() && selectedImages.length === 0)}
              >
                ➤
              </button>
            </div>
          </div>
        )}
        <button 
          className="ai-chat-button"
          onClick={() => setChatOpen(!chatOpen)}
        >
          🤖
        </button>

        {/* Correction Modal */}
        {correctionModal && selectedConversation && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem'
          }}>
            <div style={{
              background: '#1e293b',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                    {conversationCorrections[selectedConversation.id] ? '👁️ Vezi/Editează Corecția' : '✏️ Corectează Răspuns AI'}
                  </h2>
                  {conversationCorrections[selectedConversation.id] && (
                    <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>
                      ✓ Corectat la {conversationCorrections[selectedConversation.id].correctedAt?.toLocaleString('ro-RO')}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setCorrectionModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '0.5rem'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Întrebarea user-ului */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  ❓ Întrebarea User-ului:
                </label>
                <div style={{
                  background: '#0f172a',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #1e293b',
                  color: '#e2e8f0'
                }}>
                  {selectedConversation.userMessage}
                </div>
              </div>

              {/* Răspunsul AI original */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  🤖 Răspunsul AI (Original):
                </label>
                <div style={{
                  background: '#0f172a',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #1e293b',
                  color: '#cbd5e1'
                }}>
                  {selectedConversation.aiResponse}
                </div>
              </div>

              {/* Răspunsul corect */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  ✅ Răspunsul Corect (Tu scrii):
                </label>
                <textarea
                  value={correctedResponse}
                  onChange={(e) => setCorrectedResponse(e.target.value)}
                  placeholder="Scrie răspunsul corect aici..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    color: '#e2e8f0',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Prompt pentru AI */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  📝 Prompt pentru AI (Opțional - pentru învățare):
                </label>
                <textarea
                  value={correctionPrompt}
                  onChange={(e) => setCorrectionPrompt(e.target.value)}
                  placeholder="Ex: Când user întreabă despre weekend, explică-i cum să seteze disponibilitatea în app..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    color: '#e2e8f0',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  💡 Acest prompt va fi salvat în Firebase și AI va învăța din el
                </div>
              </div>

              {/* Butoane */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setCorrectionModal(false)}
                  disabled={savingCorrection}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#334155',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: savingCorrection ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                >
                  ❌ Anulează
                </button>
                <button
                  onClick={saveCorrection}
                  disabled={savingCorrection || !correctedResponse.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: savingCorrection || !correctedResponse.trim() ? '#64748b' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: savingCorrection || !correctedResponse.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                >
                  {savingCorrection ? '⏳ Se salvează...' : '💾 Salvează Corecție'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default HomeScreen;
