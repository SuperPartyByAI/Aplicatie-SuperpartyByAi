import { useState, useEffect } from 'react';
import { setToastCallback, clearToastCallback } from '../utils/toast';

function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const timeouts = new Map();

    const callback = (message, type) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type }]);

      const timeoutId = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timeouts.delete(id);
      }, 4000);

      timeouts.set(id, timeoutId);
    };

    setToastCallback(callback);

    return () => {
      clearToastCallback();
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
      timeouts.clear();
    };
  }, []);

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' && '✓'}
            {toast.type === 'error' && '✗'}
            {toast.type === 'warning' && '⚠'}
            {toast.type === 'info' && 'ℹ'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

export default Toast;
