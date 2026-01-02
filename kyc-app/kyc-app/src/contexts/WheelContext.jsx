import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';

const WheelContext = createContext();

export const WheelProvider = ({ children }) => {
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelActions, setWheelActions] = useState({ inner: [], outer: [] });
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

  const toggleWheel = () => setWheelOpen((prev) => !prev);
  const closeWheel = () => setWheelOpen(false);

  return (
    <WheelContext.Provider
      value={{
        wheelOpen,
        wheelActions,
        role,
        toggleWheel,
        closeWheel,
        setWheelActions,
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
