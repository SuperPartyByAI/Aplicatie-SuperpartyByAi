function getBackendBaseUrl() {
  // Priority: new explicit base URL
  if (process.env.WHATSAPP_BACKEND_BASE_URL) {
    return process.env.WHATSAPP_BACKEND_BASE_URL;
  }

  // Legacy: backend URL
  if (process.env.WHATSAPP_BACKEND_URL) {
    return process.env.WHATSAPP_BACKEND_URL;
  }

  // Try v1 functions.config() (v2 may not have this)
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
