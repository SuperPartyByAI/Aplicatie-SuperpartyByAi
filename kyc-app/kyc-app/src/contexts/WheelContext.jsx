import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';

const WheelContext = createContext();

export const WheelProvider = ({ children }) => {
  // Single active state: 'home' | 'ai' | 'grid' | 'centrala' | 'chat' | 'team'
  const [activeView, setActiveView] = useState('home');
  const [adminMode, setAdminMode] = useState(false);
  const [gmMode, setGmMode] = useState(false);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  // Listen to auth changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Detect role
  const role = currentUser?.email === 'ursache.andrei1995@gmail.com' ? 'admin' : 'user';

  // Single source of truth for active state
  const setView = (view) => {
    setActiveView(view);
  };

  // Toggle: if same view, go to home; otherwise switch
  const toggleView = (view) => {
    setActiveView(prev => prev === view ? 'home' : view);
  };

  // Backward compatibility
  const wheelOpen = activeView === 'grid';
  const aiChatOpen = activeView === 'ai';
  const isWheelOpen = wheelOpen;
  const isAiChatOpen = aiChatOpen;
  
  const toggleWheel = () => toggleView('grid');
  const closeWheel = () => setView('home');
  const toggleAiChat = () => toggleView('ai');
  const closeAiChat = () => setView('home');

  return (
    <WheelContext.Provider
      value={{
        activeView,
        setView,
        toggleView,
        wheelOpen,
        isWheelOpen,
        aiChatOpen,
        isAiChatOpen,
        role,
        adminMode,
        gmMode,
        setAdminMode,
        setGmMode,
        toggleWheel,
        closeWheel,
        toggleAiChat,
        closeAiChat,
      }}
    >
      {children}
    </WheelContext.Provider>
  );
};

export const useWheel = () => {
  const context = useContext(WheelContext);
  if (!context) {
    throw new Error('useWheel must be used within WheelProvider');
  }
  return context;
};
