import { useNavigate, useLocation } from 'react-router-dom';
import './Dock.css';

export default function Dock({ onOpenChatAI }) {
  const navigate = useNavigate();
  const location = useLocation();

  const dockItems = [
    { id: 'calls', icon: '📞', label: 'Calls', route: '/centrala-telefonica' },
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti' },
    { id: 'team', icon: '👥', label: 'Echipă', route: '/team' },
    { id: 'chat-ai', icon: '🤖', label: 'Chat AI', route: '/home', state: { intent: 'openChatAI' } },
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
