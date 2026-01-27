/**
 * Get backend base URL (Hetzner VPS)
 * 
 * Priority order:
 * 1. BACKEND_BASE_URL (preferred, generic name)
 * 2. WHATSAPP_BACKEND_BASE_URL (legacy)
 * 3. WHATSAPP_BACKEND_URL (legacy)
 * 4. Firebase config (whatsapp.backend_base_url)
 * 
 * Default: http://37.27.34.179:8080 (Hetzner VPS)
 */
function getBackendBaseUrl() {
  // New generic name (preferred)
  if (process.env.BACKEND_BASE_URL) {
    return process.env.BACKEND_BASE_URL;
  }
  
  // Legacy names (still supported)
  if (process.env.WHATSAPP_BACKEND_BASE_URL) {
    return process.env.WHATSAPP_BACKEND_BASE_URL;
  }
  if (process.env.WHATSAPP_BACKEND_URL) {
    return process.env.WHATSAPP_BACKEND_URL;
  }
  
  // Firebase config fallback
  try {
    const functions = require('firebase-functions');
    const config = functions.config();
    if (config?.whatsapp?.backend_base_url) {
      return config.whatsapp.backend_base_url;
    }
  } catch (e) {
    // Ignore
  }
  
  // Default: Hetzner VPS (if no config found, this prevents null errors)
  const defaultBackendUrl = 'http://37.27.34.179:8080';
  console.warn(
    '[backend-url] No backend URL configured. Using default Hetzner VPS: ' + defaultBackendUrl +
    '. Please set BACKEND_BASE_URL or WHATSAPP_BACKEND_BASE_URL in Firebase Functions secrets.'
  );
  return defaultBackendUrl;
}

module.exports = {
  getBackendBaseUrl,
};
