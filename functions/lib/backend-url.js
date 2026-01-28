/**
 * Get backend base URL (Hetzner VPS)
 * 
 * Priority order:
 * 1. BACKEND_BASE_URL (preferred, generic name)
 * 2. WHATSAPP_BACKEND_BASE_URL (current standard)
 * 3. WHATSAPP_BACKEND_URL (legacy)
 * 4. Firebase config (whatsapp.backend_base_url)
 * 
 * Default: https://whats-app-ompro.ro (Hetzner production)
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
  
  // Default: Hetzner production (if no config found, this prevents null errors)
  const defaultBackendUrl = 'https://whats-app-ompro.ro';
  console.warn(
    '[backend-url] No backend URL configured. Using default Hetzner production: ' + defaultBackendUrl +
    '. Please set WHATSAPP_BACKEND_BASE_URL (or BACKEND_BASE_URL) in Firebase Functions secrets.'
  );
  return defaultBackendUrl;
}

module.exports = {
  getBackendBaseUrl,
};
