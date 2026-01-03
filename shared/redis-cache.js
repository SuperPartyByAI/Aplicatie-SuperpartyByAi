const Redis = require('ioredis');
const { featureFlags } = require('./feature-flags');

/**
 * Redis Cache Implementation
 *
 * Provides distributed caching with automatic fallback to in-memory cache
 * if Redis is not available.
 *
 * Features:
 * - Persistent cache across restarts
 * - Shared cache between multiple instances
 * - Automatic fallback to in-memory cache
 * - TTL-based expiration
 * - getOrSet pattern for fetch-on-miss
 */
class RedisCache {
  constructor() {
    this.enabled = false;
    this.client = null;
    this.memoryCache = null;

    // Try to connect to Redis if URL is provided
    if (process.env.REDIS_URL) {
      try {
        this.client = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });

        this.client.on('connect', () => {
          console.log('✅ Redis connected successfully');
          this.enabled = true;
        });

        this.client.on('error', err => {
          console.error('❌ Redis error:', err.message);
          this.enabled = false;
        });

        this.client.on('close', () => {
          console.warn('⚠️ Redis connection closed, falling back to memory cache');
          this.enabled = false;
        });
      } catch (error) {
        console.error('❌ Failed to initialize Redis:', error.message);
        this.enabled = false;
      }
    } else {
      console.warn('⚠️ REDIS_URL not found, using in-memory cache');
    }

    // Fallback to in-memory cache
    if (!this.enabled) {
      this.memoryCache = require('./cache');
    }
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (default: 30s)
   */
  async set(key, value, ttl = 30000) {
    if (!this.enabled || !this.client) {
      return this.memoryCache.set(key, value, ttl);
    }

    try {
      const ttlSeconds = Math.floor(ttl / 1000);
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error('Redis set error:', error.message);
      // Fallback to memory cache
      this.memoryCache = this.memoryCache || require('./cache');
      this.memoryCache.set(key, value, ttl);
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    if (!this.enabled || !this.client) {
      return this.memoryCache.get(key);
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error.message);
      // Fallback to memory cache
      this.memoryCache = this.memoryCache || require('./cache');
      return this.memoryCache.get(key);
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    if (!this.enabled || !this.client) {
      return this.memoryCache.has(key);
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Redis has error:', error.message);
      this.memoryCache = this.memoryCache || require('./cache');
      return this.memoryCache.has(key);
    }
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  async delete(key) {
    if (!this.enabled || !this.client) {
      return this.memoryCache.delete(key);
    }

    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis delete error:', error.message);
      this.memoryCache = this.memoryCache || require('./cache');
      this.memoryCache.delete(key);
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    if (!this.enabled || !this.client) {
      return this.memoryCache.clear();
    }

    try {
      await this.client.flushdb();
    } catch (error) {
      console.error('Redis clear error:', error.message);
      this.memoryCache = this.memoryCache || require('./cache');
      this.memoryCache.clear();
    }
  }

  /**
   * Get or set pattern - fetch data if not in cache
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<any>}
   */
  async getOrSet(key, fetchFn, ttl = 30000) {
    if (!this.enabled || !this.client) {
      return this.memoryCache.getOrSet(key, fetchFn, ttl);
    }

    try {
      // Try to get from cache
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      // Fetch new data
      const value = await fetchFn();

      // Cache it
      await this.set(key, value, ttl);

      return value;
    } catch (error) {
      console.error('Redis getOrSet error:', error.message);
      // Fallback to memory cache
      this.memoryCache = this.memoryCache || require('./cache');
      return this.memoryCache.getOrSet(key, fetchFn, ttl);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    if (!this.enabled || !this.client) {
      return {
        enabled: false,
        type: 'memory',
        fallback: true,
      };
    }

    try {
      const info = await this.client.info('stats');
      const keyspace = await this.client.info('keyspace');
      const dbsize = await this.client.dbsize();

      return {
        enabled: true,
        type: 'redis',
        connected: this.client.status === 'ready',
        keys: dbsize,
        info: info.split('\n').slice(0, 10).join('\n'),
        keyspace: keyspace.split('\n').slice(0, 5).join('\n'),
      };
    } catch (error) {
      console.error('Redis stats error:', error.message);
      return {
        enabled: false,
        type: 'redis',
        error: error.message,
        fallback: true,
      };
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
    }
  }

  /**
   * Get cache type (redis or memory)
   * @returns {string}
   */
  getType() {
    return this.enabled ? 'redis' : 'memory';
  }

  /**
   * Check if Redis is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }
}

// Export singleton instance
module.exports = new RedisCache();
