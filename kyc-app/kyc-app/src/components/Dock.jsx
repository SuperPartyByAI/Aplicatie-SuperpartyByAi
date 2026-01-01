import { useNavigate, useLocation } from 'react-router-dom';
import './Dock.css';

export default function Dock({ onOpenChatAI }) {
  const navigate = useNavigate();
  const location = useLocation();

  const dockItems = [
    { id: 'calls', icon: '📞', label: 'Calls', route: '/centrala-telefonica' },
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti' },
    { id: 'team', icon: '👥', label: 'Echipă', route: '/staff-setup' },
    { id: 'chat-ai', icon: '🤖', label: 'Chat AI', action: 'openChatAI' },
  ];

  const handleClick = (item) => {
    if (item.action === 'openChatAI') {
      // Navigate to home and open chat sidebar
      navigate('/home');
      if (onOpenChatAI) {
        setTimeout(() => onOpenChatAI(), 100);
      }
    } else if (item.route) {
      navigate(item.route);
    }
  };

  return (
    <div className="dock">
      {dockItems.map((item) => (
        <button
          key={item.id}
          className={`dock-button ${location.pathname === item.route ? 'active' : ''}`}
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
