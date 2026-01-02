import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getWheelActions } from '../config/wheelActions';

const WheelContext = createContext();

export const WheelProvider = ({ children }) => {
  const [wheelOpen, setWheelOpen] = useState(false);
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

  // Get dynamic wheel actions based on mode
  const wheelActions = getWheelActions(role, adminMode, gmMode);

  const toggleWheel = () => setWheelOpen((prev) => !prev);
  const closeWheel = () => setWheelOpen(false);

  return (
    <WheelContext.Provider
      value={{
        wheelOpen,
        wheelActions,
        role,
        adminMode,
        gmMode,
        setAdminMode,
        setGmMode,
        toggleWheel,
        closeWheel,
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
