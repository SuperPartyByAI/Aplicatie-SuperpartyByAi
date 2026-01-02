import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Hook for swipe down gesture to close/navigate back
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Enable/disable the gesture
 * @param {number} options.threshold - Minimum distance in pixels to trigger (default: 100)
 * @param {number} options.velocityThreshold - Minimum velocity to trigger (default: 0.5)
 * @param {Function} options.onSwipeDown - Custom callback instead of navigate back
 */
export const useSwipeDown = ({ 
  enabled = true, 
  threshold = 100, 
  velocityThreshold = 0.5,
  onSwipeDown 
} = {}) => {
  const navigate = useNavigate();
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const scrollTop = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e) => {
      // Only trigger if scrolled to top
      const element = e.target.closest('[data-swipe-container]') || document.documentElement;
      scrollTop.current = element.scrollTop;
      
      if (scrollTop.current === 0) {
        touchStartY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
      }
    };

    const handleTouchMove = (e) => {
      if (touchStartY.current === 0) return;
      
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY.current;
      
      // Only allow downward swipe
      if (deltaY > 0 && scrollTop.current === 0) {
        // Optional: Add visual feedback here
        // e.g., transform the container slightly
      }
    };

    const handleTouchEnd = (e) => {
      if (touchStartY.current === 0) return;

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchEndY - touchStartY.current;
      const deltaTime = Date.now() - touchStartTime.current;
      const velocity = Math.abs(deltaY) / deltaTime;

      // Reset
      touchStartY.current = 0;
      touchStartTime.current = 0;

      // Check if swipe down meets threshold
      if (deltaY > threshold && velocity > velocityThreshold && scrollTop.current === 0) {
        if (onSwipeDown) {
          onSwipeDown();
        } else {
          // Default: navigate back or to home
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/home');
          }
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, velocityThreshold, navigate, onSwipeDown]);
};
