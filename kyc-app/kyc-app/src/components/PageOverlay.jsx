import { useEffect, useState } from 'react';
import './PageOverlay.css';

export default function PageOverlay({ children, isOpen = true }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className={`page-overlay ${isAnimating ? 'page-overlay-open' : ''}`}>
      <div className="page-overlay-content">
        {children}
      </div>
    </div>
  );
}
