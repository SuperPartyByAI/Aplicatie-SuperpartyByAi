function getBackendBaseUrl() {
  if (process.env.WHATSAPP_BACKEND_BASE_URL) {
    return process.env.WHATSAPP_BACKEND_BASE_URL;
  }
  if (process.env.WHATSAPP_BACKEND_URL) {
    return process.env.WHATSAPP_BACKEND_URL;
  }
  // Deprecated: migrate to WHATSAPP_BACKEND_URL (Hetzner or generic backend)
  if (process.env.WHATSAPP_RAILWAY_BASE_URL) {
    console.warn('[backend-url] DEPRECATED: WHATSAPP_RAILWAY_BASE_URL; use WHATSAPP_BACKEND_URL');
    return process.env.WHATSAPP_RAILWAY_BASE_URL;
  }
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
