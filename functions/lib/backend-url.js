/**
 * Get backend base URL (deployment-agnostic: Hetzner, Railway, or any other backend)
 * 
 * Priority order:
 * 1. BACKEND_BASE_URL (new, generic name)
 * 2. WHATSAPP_BACKEND_BASE_URL (legacy)
 * 3. WHATSAPP_BACKEND_URL (legacy)
 * 4. WHATSAPP_RAILWAY_BASE_URL (deprecated, fallback only with warning)
 * 5. Firebase config (whatsapp.backend_base_url)
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
  
  // Deprecated Railway-specific name (fallback with warning)
  if (process.env.WHATSAPP_RAILWAY_BASE_URL) {
    console.warn(
      '[backend-url] WHATSAPP_RAILWAY_BASE_URL is deprecated. ' +
      'Please use BACKEND_BASE_URL or WHATSAPP_BACKEND_BASE_URL instead.'
    );
    return process.env.WHATSAPP_RAILWAY_BASE_URL;
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
  
  return null;
}

module.exports = {
  getBackendBaseUrl,
};
