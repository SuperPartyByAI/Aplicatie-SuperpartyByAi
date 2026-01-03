import { useNavigate, useLocation } from 'react-router-dom';
import { useWheel } from '../contexts/WheelContext';
import './Dock.css';

export default function Dock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeView, toggleView, setView } = useWheel();

  const dockItems = [
    {
      id: 'centrala',
      icon: '📞',
      label: 'Centrala',
      route: '/centrala-telefonica',
      view: 'centrala',
    },
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti', view: 'chat' },
    { id: 'fab', icon: '➕', label: 'Meniu', view: 'grid' },
    { id: 'team', icon: '👥', label: 'Echipă', route: '/team', view: 'team' },
    { id: 'ai', icon: '🤖', label: 'AI Chat', view: 'ai' },
  ];

  const handleClick = item => {
    // Toggle behavior: if same view, go to home
    if (activeView === item.view) {
      setView('home');
      if (item.route) {
        navigate('/home');
      }
      return;
    }

    // Switch to new view (exclusivity automatic)
    toggleView(item.view);

    // Navigate if has route
    if (item.route) {
      navigate(item.route, { state: item.state });
    }
  };

  return (
    <div className="dock">
      {dockItems.map(item => (
        <button
          key={item.id}
          className={`dock-button ${item.view === 'grid' ? 'fab-button' : ''} ${activeView === item.view ? 'active' : ''}`}
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
