// Version check utility - prompts user to refresh on new deployment

const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const CURRENT_BUILD_TIME = import.meta.env.VITE_BUILD_TIME || 'unknown';

let checkInterval = null;

// Detect if running as PWA
function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}

export function startVersionCheck() {
  // Store current version on first load
  const storedVersion = localStorage.getItem('app_build_time');
  
  if (!storedVersion) {
    localStorage.setItem('app_build_time', CURRENT_BUILD_TIME);
    return;
  }

  // Check if version changed (new deployment)
  if (storedVersion !== CURRENT_BUILD_TIME) {
    console.log('🔄 New version detected:', CURRENT_BUILD_TIME, '(old:', storedVersion + ')');
    console.log('📱 Running as PWA:', isPWA());
    promptUserToRefresh();
    return;
  }

  // Periodic check for new version
  if (checkInterval) clearInterval(checkInterval);
  
  checkInterval = setInterval(async () => {
    try {
      // Fetch index.html with cache-busting
      const response = await fetch(`/index.html?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      const html = await response.text();
      
      // Extract build time from meta tag (we'll add this)
      const match = html.match(/data-build-time="([^"]+)"/);
      if (match && match[1] !== CURRENT_BUILD_TIME) {
        console.log('🔄 New version available:', match[1]);
        promptUserToRefresh();
        clearInterval(checkInterval);
      }
    } catch (error) {
      console.warn('Version check failed:', error);
    }
  }, VERSION_CHECK_INTERVAL);
}

export function stopVersionCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

function promptUserToRefresh() {
  const runningAsPWA = isPWA();
  
  // Create a non-intrusive banner
  const banner = document.createElement('div');
  banner.id = 'version-update-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 16px;
      text-align: center;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    ">
      <strong>🎉 Versiune nouă disponibilă!</strong>
      ${runningAsPWA ? '<div style="font-size: 12px; margin-top: 4px;">Aplicație instalată - actualizare automată</div>' : ''}
      <button onclick="window.location.reload(true)" style="
        margin-left: 12px;
        padding: 6px 16px;
        background: white;
        color: #667eea;
        border: none;
        border-radius: 20px;
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
      ">
        Reîmprospătează Acum
      </button>
    </div>
  `;
  
  document.body.appendChild(banner);
  
  // For PWA, force service worker update
  if (runningAsPWA && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) {
        console.log('🔄 Forcing SW update for PWA...');
        registration.update();
      }
    });
  }
  
  // Auto-refresh after 10 seconds if user doesn't click
  setTimeout(() => {
    console.log('🔄 Auto-refreshing to new version...');
    // For PWA, clear caches before reload
    if (runningAsPWA && 'caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      }).finally(() => {
        window.location.reload(true);
      });
    } else {
      window.location.reload(true);
    }
  }, 10000);
}
