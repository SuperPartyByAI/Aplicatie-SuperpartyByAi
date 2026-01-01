import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWheel } from '../contexts/WheelContext';
import './FAB.css';

export default function FAB() {
  const { toggleWheel } = useWheel();
  const navigate = useNavigate();
  const location = useLocation();
  const [lastTap, setLastTap] = useState(0);

  const isHome = location.pathname === '/home';

  const handleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300; // ms

    if (now - lastTap < DOUBLE_TAP_DELAY && !isHome) {
      // Double tap → Go Home
      navigate('/home');
    } else if (isHome) {
      // Single tap on Home → Toggle wheel
      toggleWheel();
    }

    setLastTap(now);
  };

  return (
    <button className="fab" onClick={handleTap} title={isHome ? 'Deschide meniu' : 'Dublu-click pentru Home'}>
      <span className="fab-icon">➕</span>
    </button>
  );
}
