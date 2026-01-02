import { useNavigate, useLocation } from 'react-router-dom';
import { useWheel } from '../contexts/WheelContext';
import './Dock.css';

export default function Dock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleWheel } = useWheel();

  const dockItems = [
    { id: 'centrala', icon: '📞', label: 'Centrala', route: '/centrala-telefonica' },
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti' },
    { id: 'fab', icon: '➕', label: 'Meniu', isFAB: true },
    { id: 'team', icon: '👥', label: 'Echipă', route: '/team' },
    { id: 'home', icon: '🤖', label: 'Acasă + AI', route: '/home' },
  ];

  const handleClick = (item) => {
    if (item.isFAB) {
      toggleWheel();
    } else if (item.route) {
      navigate(item.route, { state: item.state });
    }
  };

  return (
    <div className="dock">
      {dockItems.map((item) => (
        <button
          key={item.id}
          className={`dock-button ${item.isFAB ? 'fab-button' : ''} ${location.pathname === item.route ? 'active' : ''}`}
          onClick={() => handleClick(item)}
          title={item.label}
        >
          <span className="dock-icon">{item.icon}</span>
          <span className="dock-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
