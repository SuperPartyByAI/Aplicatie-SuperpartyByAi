const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CoquiHandler {
  constructor() {
    this.apiUrl = process.env.COQUI_API_URL || 'https://web-production-00dca9.up.railway.app';
    this.tempDir = path.join(__dirname, '../../temp');
    this.cacheDir = path.join(__dirname, '../../cache');
    this.enabled = false;
    
    // Create directories
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    // Check if Coqui service is available
    this.checkAvailability();
  }
  
  async checkAvailability() {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        timeout: 5000
      });
      
      if (response.ok) {
        const data = await response.json();
        this.enabled = data.status === 'healthy';
        console.log('[Coqui] Service available:', this.apiUrl);
      } else {
        console.warn('[Coqui] Service not available yet');
      }
    } catch (error) {
      console.warn('[Coqui] Service not reachable:', error.message);
    }
  }
  
  isConfigured() {
    return this.enabled;
  }
  
  getCacheKey(text) {
    return crypto.createHash('md5').update(text).digest('hex');
  }
  
  /**
   * Generate speech from text using Coqui XTTS
   * Returns path to audio file
   */
  async generateSpeech(text) {
    if (!this.enabled) {
      console.warn('[Coqui] Service not available, checking again...');
      await this.checkAvailability();
      
      if (!this.enabled) {
        return null;
      }
    }
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(text);
      const cachedFile = path.join(this.cacheDir, `${cacheKey}.wav`);
      
      if (fs.existsSync(cachedFile)) {
        console.log('[Coqui] Cache hit:', cacheKey);
        return `/audio/${cacheKey}.wav`;
      }
      
      console.log('[Coqui] Generating speech:', text.substring(0, 50) + '...');
      const startTime = Date.now();
      
      // Call Coqui API
      const response = await fetch(`${this.apiUrl}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          use_cache: true
        }),
        timeout: 30000 // 30 seconds
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[Coqui] API error:', response.status, error);
        return null;
      }
      
      // Save audio file
      const buffer = await response.buffer();
      fs.writeFileSync(cachedFile, buffer);
      
      const duration = Date.now() - startTime;
      console.log(`[Coqui] Generated in ${duration}ms, saved to cache`);
      
      return `/audio/${cacheKey}.wav`;
      
    } catch (error) {
      console.error('[Coqui] Error generating speech:', error.message);
      return null;
    }
  }
  
  /**
   * Clean up old audio files (older than 1 hour)
   */
  cleanupOldFiles() {
    try {
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour
      
      let cleaned = 0;
      
      // Clean temp directory
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          const filePath = path.join(this.tempDir, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtimeMs > maxAge) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        }
      }
      
      if (cleaned > 0) {
        console.log(`[Coqui] Cleaned up ${cleaned} old files`);
      }
    } catch (error) {
      console.error('[Coqui] Error cleaning up files:', error);
    }
  }
}

module.exports = CoquiHandler;
