import { useNavigate, useLocation } from 'react-router-dom';
import './Dock.css';

export default function Dock({ onOpenChatAI }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Only show Dock on /home
  if (location.pathname !== '/home') {
    return null;
  }

  const dockItems = [
    { id: 'calls', icon: '📞', label: 'Calls', route: '/centrala-telefonica', position: 'left' },
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti', position: 'mid-left' },
    { id: 'team', icon: '👥', label: 'Echipă', route: '/team', position: 'mid-right' },
    { id: 'chat-ai', icon: '🤖', label: 'Chat AI', route: '/home', state: { intent: 'openChatAI' }, position: 'right' },
  ];

  const handleClick = (item) => {
    if (item.route) {
      navigate(item.route, { state: item.state });
    }
  };

  return (
    <div className="dock">
      {dockItems.map((item) => (
        <button
          key={item.id}
          className={`dock-button dock-button-${item.position} ${location.pathname === item.route ? 'active' : ''}`}
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
