import { useEffect } from 'react';
import { useWheel } from '../contexts/WheelContext';
import { useNavigate, useLocation } from 'react-router-dom';
import './WheelOverlay.css';

export default function WheelOverlay() {
  const { wheelOpen, wheelActions, closeWheel } = useWheel();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle system back button (browser back)
  useEffect(() => {
    if (!wheelOpen) return;

    const handlePopState = (e) => {
      e.preventDefault();
      closeWheel();
      window.history.pushState(null, '', window.location.pathname);
    };

    window.history.pushState(null, '', window.location.pathname);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [wheelOpen, closeWheel]);

  // Handle Escape key
  useEffect(() => {
    if (!wheelOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeWheel();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [wheelOpen, closeWheel]);

  if (!wheelOpen) return null;

  const handleAction = (action) => {
    if (action.action === 'exitAdminMode' || action.action === 'exitGMMode') {
      // Handle exit actions via navigate with state
      navigate('/home', { state: { intent: { action: action.action } } });
    } else if (action.route) {
      // Navigate to route
      navigate(action.route, action.state ? { state: action.state } : {});
    } else if (action.state) {
      // Navigate to home with intent
      navigate('/home', { state: action.state });
    }
    closeWheel();
  };

  return (
    <div className="wheel-overlay" onClick={closeWheel}>
      <div className="wheel-container" onClick={(e) => e.stopPropagation()}>
        {/* Grid Layout */}
        <div className="wheel-grid">
          {wheelActions.map((action) => (
            <button
              key={action.id}
              className={`wheel-button wheel-button-${action.type}`}
              onClick={() => handleAction(action)}
            >
              <span className="wheel-icon">{action.icon}</span>
              <span className="wheel-label">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Close button */}
        <button className="wheel-close" onClick={closeWheel}>
          ✕
        </button>
      </div>
    </div>
  );
}
