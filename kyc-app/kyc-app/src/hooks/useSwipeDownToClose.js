import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function useSwipeDownToClose({ thresholdPx = 100, enabled = true }) {
  const navigate = useNavigate();
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const scrollTop = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e) => {
      const target = e.target.closest('.page-overlay-content');
      if (!target) return;

      scrollTop.current = target.scrollTop;
      
      // Only allow swipe down when at top of scroll
      if (scrollTop.current === 0) {
        touchStartY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
      }
    };

    const handleTouchMove = (e) => {
      if (touchStartY.current === 0) return;

      const touchCurrentY = e.touches[0].clientY;
      const deltaY = touchCurrentY - touchStartY.current;

      // Only prevent default if swiping down from top
      if (deltaY > 0 && scrollTop.current === 0) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e) => {
      if (touchStartY.current === 0) return;

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchEndY - touchStartY.current;
      const deltaTime = Date.now() - touchStartTime.current;
      const velocity = Math.abs(deltaY) / deltaTime; // px/ms

      // Swipe down detected
      if (deltaY > thresholdPx && velocity > 0.3) {
        // Navigate back or to home
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate('/home');
        }
      }

      // Reset
      touchStartY.current = 0;
      touchStartTime.current = 0;
      scrollTop.current = 0;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, thresholdPx, navigate]);
}
