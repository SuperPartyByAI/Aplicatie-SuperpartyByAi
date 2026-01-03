// Auto-update checker - silent reload on new version
// No banner, no user interruption during typing

const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
const CURRENT_BUILD = import.meta.env.VITE_COMMIT_SHA || 'unknown';

let pendingUpdate = false;
let checkInterval = null;

// Check if user is actively typing
function isUserTyping() {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  const isEditable = activeElement.isContentEditable;
  const isInput = tagName === 'input' || tagName === 'textarea';
  
  return isInput || isEditable;
}

// Check for new version
async function checkForUpdate() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      console.warn('Failed to fetch version.json:', response.status);
      return;
    }
    
    const data = await response.json();
    
    console.log('Version check:', {
      current: CURRENT_BUILD,
      remote: data.build,
      needsUpdate: data.build !== CURRENT_BUILD
    });
    
    if (data.build !== CURRENT_BUILD) {
      console.log('🔄 New version detected:', data.build);
      pendingUpdate = true;
      attemptReload();
    }
  } catch (error) {
    console.warn('Version check failed:', error);
  }
}

// Attempt reload if conditions are met
function attemptReload() {
  if (!pendingUpdate) return;
  
  // Don't reload if user is typing
  if (isUserTyping()) {
    console.log('⏸️ Update pending - user is typing');
    return;
  }
  
  // Don't reload if page is not visible
  if (document.visibilityState !== 'visible') {
    console.log('⏸️ Update pending - page not visible');
    return;
  }
  
  console.log('🔄 Applying update - clearing cache and reloading...');
  
  // Clear all caches before reload
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  
  // Hard reload with cache bypass
  window.location.reload(true);
}

// Start auto-update checker
export function startAutoUpdate() {
  console.log('🔄 Auto-update checker started', {
    build: CURRENT_BUILD,
    checkInterval: `${CHECK_INTERVAL / 1000}s`
  });
  
  // Initial check after 5 seconds
  setTimeout(checkForUpdate, 5000);
  
  // Periodic check
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(checkForUpdate, CHECK_INTERVAL);
  
  // Check on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (pendingUpdate) {
        console.log('👁️ Page visible - attempting update');
        attemptReload();
      } else {
        // Check for update when user returns
        checkForUpdate();
      }
    }
  });
  
  // Check when input loses focus
  document.addEventListener('blur', (e) => {
    const target = e.target;
    const tagName = target?.tagName?.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea';
    
    if (isInput && pendingUpdate) {
      console.log('⌨️ Input blur - attempting update');
      setTimeout(attemptReload, 100);
    }
  }, true);
}

// Stop auto-update checker
export function stopAutoUpdate() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
