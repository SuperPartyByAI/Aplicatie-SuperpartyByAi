/**
 * Get backend base URL (Hetzner VPS)
 * 
 * Priority order:
 * 1. WHATSAPP_BACKEND_BASE_URL (env var or Firebase secret)
 * 2. Firebase config (whatsapp.backend_base_url)
 * 
 * Default: http://37.27.34.179:8080 (Hetzner production)
 */
function getBackendBaseUrl() {
  // Standard: WHATSAPP_BACKEND_BASE_URL
  if (process.env.WHATSAPP_BACKEND_BASE_URL) {
    return process.env.WHATSAPP_BACKEND_BASE_URL;
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
  
  // Default: Hetzner production (if no config found, this prevents null errors)
  const defaultBackendUrl = 'http://37.27.34.179:8080';
  console.warn(
    '[backend-url] No backend URL configured. Using default Hetzner: ' + defaultBackendUrl +
    '. Please set WHATSAPP_BACKEND_BASE_URL in Firebase Functions secrets.'
  );
  return defaultBackendUrl;
}

module.exports = {
  getBackendBaseUrl,
};
