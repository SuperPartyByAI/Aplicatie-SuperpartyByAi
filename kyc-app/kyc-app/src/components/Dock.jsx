import { useNavigate, useLocation } from 'react-router-dom';
import { useWheel } from '../contexts/WheelContext';
import './Dock.css';

export default function Dock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleWheel, toggleAiChat, isAiChatOpen, isWheelOpen, closeWheel, closeAiChat } = useWheel();

  const dockItems = [
    { id: 'centrala', icon: '📞', label: 'Centrala', route: '/centrala-telefonica' },
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti' },
    { id: 'fab', icon: '➕', label: 'Meniu', isFAB: true },
    { id: 'team', icon: '👥', label: 'Echipă', route: '/team' },
    { id: 'ai', icon: '🤖', label: 'AI Chat', isAiChat: true },
  ];

  const handleClick = (item) => {
    // Close other overlays first (exclusivity)
    if (!item.isFAB && isWheelOpen) {
      closeWheel();
    }
    if (!item.isAiChat && isAiChatOpen) {
      closeAiChat();
    }

    // Handle click based on type
    if (item.isFAB) {
      toggleWheel();
    } else if (item.isAiChat) {
      toggleAiChat();
    } else if (item.route) {
      // Toggle behavior: if already on route, go back to Home
      if (location.pathname === item.route) {
        navigate('/home');
      } else {
        navigate(item.route, { state: item.state });
      }
    }
  };

  return (
    <div className="dock">
      {dockItems.map((item) => (
        <button
          key={item.id}
          className={`dock-button ${item.isFAB ? 'fab-button' : ''} ${item.isAiChat && isAiChatOpen ? 'active' : ''} ${location.pathname === item.route ? 'active' : ''}`}
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
