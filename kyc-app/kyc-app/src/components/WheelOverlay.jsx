import { useWheel } from '../contexts/WheelContext';
import { useNavigate, useLocation } from 'react-router-dom';
import './WheelOverlay.css';

export default function WheelOverlay() {
  const { wheelOpen, wheelActions, closeWheel } = useWheel();
  const navigate = useNavigate();
  const location = useLocation();

  if (!wheelOpen) return null;

  const handleAction = (action) => {
    if (action.route) {
      navigate(action.route, { state: action.state });
      closeWheel();
    } else if (action.action) {
      // Navigate to /home with intent for HomeScreen to handle
      const intent = {
        action: action.action,
        view: action.view,
      };
      navigate('/home', { state: { intent } });
      closeWheel();
    }
  };

  return (
    <div className="wheel-overlay" onClick={closeWheel}>
      <div className="wheel-container" onClick={(e) => e.stopPropagation()}>
        {/* Inner Ring */}
        <div className="wheel-inner-ring">
          {wheelActions.inner.map((action, index) => {
            const stepInner = 360 / wheelActions.inner.length;
            const angle = (index * stepInner) - 90;
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
            const stepOuter = 360 / wheelActions.outer.length;
            const angle = (index * stepOuter) - 90;
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
