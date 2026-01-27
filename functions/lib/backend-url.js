/**
 * Get backend base URL (Hetzner VPS)
 * 
 * Priority order:
 * 1. BACKEND_BASE_URL (preferred, generic name)
 * 2. WHATSAPP_BACKEND_BASE_URL (current standard)
 * 3. WHATSAPP_BACKEND_URL (legacy)
 * 4. Firebase config (whatsapp.backend_base_url)
 * 5. WHATSAPP_RAILWAY_BASE_URL (deprecated, backwards compatibility)
 * 6. Firebase config (whatsapp.railway_base_url) (deprecated, backwards compatibility)
 * 
 * Default: http://37.27.34.179:8080 (Hetzner VPS)
 */
function getBackendBaseUrl() {
  // New generic name (preferred)
  if (process.env.BACKEND_BASE_URL) {
    return process.env.BACKEND_BASE_URL;
  }
  
  // Current standard
  if (process.env.WHATSAPP_BACKEND_BASE_URL) {
    return process.env.WHATSAPP_BACKEND_BASE_URL;
  }
  
  // Legacy names (still supported)
  if (process.env.WHATSAPP_BACKEND_URL) {
    return process.env.WHATSAPP_BACKEND_URL;
  }
  
  // Firebase config fallback (current)
  try {
    const functions = require('firebase-functions');
    const config = functions.config();
    if (config?.whatsapp?.backend_base_url) {
      return config.whatsapp.backend_base_url;
    }
  } catch (e) {
    // Ignore
  }
  
  // Backwards compatibility: deprecated Railway names (temporary support)
  if (process.env.WHATSAPP_RAILWAY_BASE_URL) {
    console.warn(
      '[backend-url] WHATSAPP_RAILWAY_BASE_URL is deprecated. Please migrate to WHATSAPP_BACKEND_BASE_URL.'
    );
    return process.env.WHATSAPP_RAILWAY_BASE_URL;
  }
  
  // Backwards compatibility: deprecated Firebase config
  try {
    const functions = require('firebase-functions');
    const config = functions.config();
    if (config?.whatsapp?.railway_base_url) {
      console.warn(
        '[backend-url] functions.config().whatsapp.railway_base_url is deprecated. Please migrate to whatsapp.backend_base_url.'
      );
      return config.whatsapp.railway_base_url;
    }
  } catch (e) {
    // Ignore
  }
  
  // Default: Hetzner VPS (if no config found, this prevents null errors)
  const defaultBackendUrl = 'http://37.27.34.179:8080';
  console.warn(
    '[backend-url] No backend URL configured. Using default Hetzner VPS: ' + defaultBackendUrl +
    '. Please set WHATSAPP_BACKEND_BASE_URL (or BACKEND_BASE_URL) in Firebase Functions secrets.'
  );
  return defaultBackendUrl;
}

module.exports = {
  getBackendBaseUrl,
};
