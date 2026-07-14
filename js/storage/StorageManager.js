/**
 * StorageManager - localStorage wrapper for game data persistence
 * Handles settings, stats, skins, achievements, scores, and auth data
 */
'use strict';

class StorageManager {
  /**
   * Get a value from localStorage with JSON parsing
   * @param {string} key - Storage key
   * @param {*} defaultValue - Fallback if key doesn't exist
   * @returns {*} Parsed value or default
   */
  static get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Storage] Failed to read "${key}":`, err.message);
      return defaultValue;
    }
  }

  /**
   * Set a value in localStorage with JSON serialization and quota protection
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   */
  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.code === 22) {
        console.warn('[Storage] Quota exceeded, attempting cleanup...');
        this._emergencyCleanup();
        try {
          localStorage.setItem(key, JSON.stringify(value));
          console.log('[Storage] Saved after cleanup');
        } catch (e2) {
          console.error('[Storage] Still failed after cleanup:', e2.message);
        }
      } else {
        console.warn(`[Storage] Failed to write "${key}":`, err.message);
      }
    }
  }

  /**
   * Emergency cleanup when localStorage quota is exceeded
   * Removes old score entries first, then least critical data
   */
  static _emergencyCleanup() {
    // Trim scores to last 20
    try {
      const scores = this.getLocalScores();
      if (scores.length > 20) {
        scores.length = 20;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SCORES_LOCAL, JSON.stringify(scores));
      }
    } catch(e) {}
  }

  /**
   * Remove a key from localStorage
   * @param {string} key - Storage key
   */
  static remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[Storage] Failed to remove "${key}":`, err.message);
    }
  }

  // ---- Settings ----
  static getSettings() {
    return this.get(CONFIG.STORAGE_KEYS.SETTINGS, {
      theme: 'dark',
      bgTheme: 'nebula',
      sfxVolume: 70,
      bgmVolume: 40,
      controlScheme: 'wasd',
      mobileControl: 'swipe',
      difficulty: 'normal',
      soundEnabled: true,
      musicEnabled: true
    });
  }

  static saveSettings(settings) {
    this.set(CONFIG.STORAGE_KEYS.SETTINGS, settings);
  }

  // ---- Stats ----
  static getStats() {
    return this.get(CONFIG.STORAGE_KEYS.STATS, {
      totalGames: 0,
      totalPlayTime: 0,
      totalScore: 0,
      totalFoodEaten: 0,
      highestScore: 0,
      highestLength: 0,
      bestScores: { classic: 0, timed: 0, obstacle: 0, wallpass: 0, endless: 0 },
      modesPlayed: [],
      itemsCollected: 0
    });
  }

  static saveStats(stats) {
    this.set(CONFIG.STORAGE_KEYS.STATS, stats);
  }

  // ---- Skins ----
  static getSkinData() {
    return this.get(CONFIG.STORAGE_KEYS.SKINS, {
      unlocked: ['classic-green', 'classic-blue', 'classic-red'],
      active: 'classic-green'
    });
  }

  static saveSkinData(data) {
    this.set(CONFIG.STORAGE_KEYS.SKINS, data);
  }

  // ---- Achievements ----
  static getAchievementData() {
    return this.get(CONFIG.STORAGE_KEYS.ACHIEVEMENTS, {
      unlocked: [],
      progress: {}
    });
  }

  static saveAchievementData(data) {
    this.set(CONFIG.STORAGE_KEYS.ACHIEVEMENTS, data);
  }

  // ---- Coins (stored with skins) ----
  static getCoins() {
    const skinData = this.getSkinData();
    return skinData.coins || 0;
  }

  static addCoins(amount) {
    const skinData = this.getSkinData();
    skinData.coins = (skinData.coins || 0) + amount;
    this.saveSkinData(skinData);
  }

  // ---- Local Scores (for local leaderboard) ----
  static getLocalScores() {
    return this.get(CONFIG.STORAGE_KEYS.SCORES_LOCAL, []);
  }

  static addLocalScore(scoreData) {
    const scores = this.getLocalScores();
    scores.unshift({
      ...scoreData,
      date: new Date().toISOString()
    });
    // Keep only top 200
    if (scores.length > 200) scores.length = 200;
    this.set(CONFIG.STORAGE_KEYS.SCORES_LOCAL, scores);
  }

  // ---- Auth ----
  static getToken() {
    return this.get(CONFIG.STORAGE_KEYS.AUTH_TOKEN, null);
  }

  static saveToken(token) {
    this.set(CONFIG.STORAGE_KEYS.AUTH_TOKEN, token);
  }

  static clearToken() {
    this.remove(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    this.remove(CONFIG.STORAGE_KEYS.USER);
  }

  static getUser() {
    return this.get(CONFIG.STORAGE_KEYS.USER, null);
  }

  static saveUser(user) {
    this.set(CONFIG.STORAGE_KEYS.USER, user);
  }

  // ---- Bulk Reset ----
  static resetAll() {
    Object.values(CONFIG.STORAGE_KEYS).forEach(key => this.remove(key));
  }
}
