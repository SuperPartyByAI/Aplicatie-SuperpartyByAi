/**
 * Feature Flags System
 * Simple feature toggle implementation for controlled rollouts
 */

class FeatureFlags {
  constructor() {
    this.flags = new Map();
    this.loadDefaultFlags();
  }

  /**
   * Load default feature flags
   */
  loadDefaultFlags() {
    // Default flags (can be overridden by environment variables)
    const defaults = {
      // WhatsApp features
      WHATSAPP_QR_GENERATION: process.env.FF_WHATSAPP_QR === 'false' ? false : true,
      WHATSAPP_PAIRING_CODE: process.env.FF_WHATSAPP_PAIRING === 'false' ? false : true,
      WHATSAPP_MESSAGE_SEND: process.env.FF_WHATSAPP_SEND === 'false' ? false : true,

      // Caching
      API_CACHING: process.env.FF_API_CACHING === 'false' ? false : true,
      CACHE_TTL_SECONDS: parseInt(process.env.FF_CACHE_TTL || '30', 10),

      // Monitoring
      SENTRY_ENABLED: process.env.FF_SENTRY === 'false' ? false : true,
      LOGTAIL_ENABLED: process.env.FF_LOGTAIL === 'false' ? false : true,

      // Experimental features
      EXPERIMENTAL_FEATURES: process.env.FF_EXPERIMENTAL === 'true',
      BETA_FEATURES: process.env.FF_BETA === 'true',

      // Rate limiting
      RATE_LIMIT_ENABLED: process.env.FF_RATE_LIMIT === 'false' ? false : true,
      RATE_LIMIT_MAX: parseInt(process.env.FF_RATE_LIMIT_MAX || '100', 10),
    };

    Object.entries(defaults).forEach(([key, value]) => {
      this.flags.set(key, value);
    });
  }

  /**
   * Check if a feature is enabled
   * @param {string} flagName - Feature flag name
   * @returns {boolean}
   */
  isEnabled(flagName) {
    return this.flags.get(flagName) === true;
  }

  /**
   * Get feature flag value
   * @param {string} flagName - Feature flag name
   * @param {any} defaultValue - Default value if flag not found
   * @returns {any}
   */
  get(flagName, defaultValue = false) {
    return this.flags.has(flagName) ? this.flags.get(flagName) : defaultValue;
  }

  /**
   * Set feature flag value
   * @param {string} flagName - Feature flag name
   * @param {any} value - Flag value
   */
  set(flagName, value) {
    this.flags.set(flagName, value);
  }

  /**
   * Get all flags
   * @returns {Object}
   */
  getAll() {
    return Object.fromEntries(this.flags);
  }

  /**
   * Check if feature is enabled for specific user/account
   * @param {string} flagName - Feature flag name
   * @param {string} userId - User/Account ID
   * @returns {boolean}
   */
  isEnabledForUser(flagName, userId) {
    // Simple percentage rollout based on user ID hash
    if (!this.isEnabled(flagName)) {
      return false;
    }

    const rolloutPercentage = this.get(`${flagName}_ROLLOUT`, 100);
    if (rolloutPercentage === 100) {
      return true;
    }

    // Hash user ID to get consistent percentage
    const hash = this.hashCode(userId);
    const userPercentage = Math.abs(hash % 100);
    return userPercentage < rolloutPercentage;
  }

  /**
   * Simple hash function for user ID
   * @param {string} str - String to hash
   * @returns {number}
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }
}

// Export singleton instance
const featureFlags = new FeatureFlags();

module.exports = featureFlags;
