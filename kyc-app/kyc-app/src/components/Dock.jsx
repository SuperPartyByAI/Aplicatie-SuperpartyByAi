import { useNavigate, useLocation } from 'react-router-dom';
import { useWheel } from '../contexts/WheelContext';
import './Dock.css';

export default function Dock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeView, toggleView, setView, setAdminMode, setGmMode } = useWheel();

  const dockItems = [
    { id: 'centrala', icon: '📞', label: 'Centrala', route: '/centrala-telefonica', view: 'centrala' },
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti', view: 'chat' },
    { id: 'fab', icon: '➕', label: 'Meniu', view: 'grid' },
    { id: 'admin', icon: '⚙️', label: 'Admin', view: 'admin' },
    { id: 'gm', icon: '👔', label: 'GM', view: 'gm' },
    { id: 'team', icon: '👥', label: 'Echipă', route: '/team', view: 'team' },
    { id: 'ai', icon: '🤖', label: 'AI Chat', view: 'ai' },
  ];

  const handleClick = (item) => {
    // Special handling for Admin and GM buttons
    if (item.id === 'admin') {
      setAdminMode(true);
      setGmMode(false);
      toggleView('grid'); // Open grid with admin buttons
      return;
    }
    
    if (item.id === 'gm') {
      setGmMode(true);
      setAdminMode(false);
      toggleView('grid'); // Open grid with GM buttons
      return;
    }

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
      {dockItems.map((item) => (
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
