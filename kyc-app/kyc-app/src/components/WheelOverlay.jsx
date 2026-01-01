import { useWheel } from '../contexts/WheelContext';
import { useNavigate, useLocation } from 'react-router-dom';
import './WheelOverlay.css';

export default function WheelOverlay({
  onLoadKycSubmissions,
  onLoadAiConversations,
  onLoadPerformanceMetrics,
  onLoadGMUsers,
  onSetCurrentView,
}) {
  const { wheelOpen, wheelActions, closeWheel, exitAdminMode, exitGMMode } = useWheel();
  const navigate = useNavigate();
  const location = useLocation();

  if (!wheelOpen) return null;

  const handleAction = (action) => {
    if (action.route) {
      navigate(action.route);
      closeWheel();
    } else if (action.action) {
      switch (action.action) {
        case 'loadKycSubmissions':
          if (onLoadKycSubmissions) onLoadKycSubmissions();
          if (action.view && onSetCurrentView) onSetCurrentView(action.view);
          break;
        case 'loadAiConversations':
          if (onLoadAiConversations) onLoadAiConversations();
          if (action.view && onSetCurrentView) onSetCurrentView(action.view);
          break;
        case 'loadPerformanceMetrics':
          if (onLoadPerformanceMetrics) onLoadPerformanceMetrics();
          if (action.view && onSetCurrentView) onSetCurrentView(action.view);
          break;
        case 'loadGMUsers':
          if (onLoadGMUsers) onLoadGMUsers();
          if (action.view && onSetCurrentView) onSetCurrentView(action.view);
          break;
        case 'exitAdminMode':
          exitAdminMode();
          break;
        case 'exitGMMode':
          exitGMMode();
          break;
        default:
          console.warn('Unknown action:', action.action);
      }
      closeWheel();
    }
  };

  return (
    <div className="wheel-overlay" onClick={closeWheel}>
      <div className="wheel-container" onClick={(e) => e.stopPropagation()}>
        {/* Inner Ring */}
        <div className="wheel-inner-ring">
          {wheelActions.inner.map((action, index) => {
            const angle = (index * 180) - 90; // Distribute evenly in circle
            return (
              <button
                key={action.id}
                className="wheel-button wheel-button-inner"
                style={{
                  transform: `rotate(${angle}deg) translate(80px) rotate(-${angle}deg)`,
                }}
                onClick={() => handleAction(action)}
                title={action.label}
              >
                <span className="wheel-icon">{action.icon}</span>
                <span className="wheel-label">{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Outer Ring */}
        <div className="wheel-outer-ring">
          {wheelActions.outer.map((action, index) => {
            const angle = (index * 90) - 45; // Distribute evenly in circle
            return (
              <button
                key={action.id}
                className="wheel-button wheel-button-outer"
                style={{
                  transform: `rotate(${angle}deg) translate(140px) rotate(-${angle}deg)`,
                }}
                onClick={() => handleAction(action)}
                title={action.label}
              >
                <span className="wheel-icon">{action.icon}</span>
                <span className="wheel-label">{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center FAB (Close button) */}
        <button className="wheel-center-fab" onClick={closeWheel} title="Închide">
          <span className="wheel-center-icon">✕</span>
        </button>
      </div>
    </div>
  );
}
