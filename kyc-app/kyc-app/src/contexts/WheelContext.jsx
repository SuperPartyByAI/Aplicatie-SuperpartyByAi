import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getWheelActions } from '../config/wheelActions';

const WheelContext = createContext();

export const WheelProvider = ({ children }) => {
  const [wheelOpen, setWheelOpen] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [gmMode, setGmMode] = useState(() => {
    const saved = localStorage.getItem('gmMode');
    return saved === 'true';
  });
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  // Persist GM Mode
  useEffect(() => {
    localStorage.setItem('gmMode', gmMode.toString());
  }, [gmMode]);

  // Listen to auth changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Detect role
  const role = currentUser?.email === 'ursache.andrei1995@gmail.com' ? 'admin' : 'user';

  // Get dynamic actions
  const wheelActions = getWheelActions(role, adminMode, gmMode);

  const toggleWheel = () => setWheelOpen((prev) => !prev);
  const closeWheel = () => setWheelOpen(false);

  const exitAdminMode = () => {
    setAdminMode(false);
    closeWheel();
  };

  const exitGMMode = () => {
    setGmMode(false);
    closeWheel();
  };

  return (
    <WheelContext.Provider
      value={{
        wheelOpen,
        wheelActions,
        adminMode,
        gmMode,
        role,
        toggleWheel,
        closeWheel,
        setAdminMode,
        setGmMode,
        exitAdminMode,
        exitGMMode,
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
