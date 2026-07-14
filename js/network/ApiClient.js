'use strict';

/**
 * ApiClient - REST API wrapper for backend communication
 * Handles JWT token management, request formatting, and error handling
 */
class ApiClient {
  /**
   * Get the base URL for API requests
   */
  static getBaseUrl() {
    return CONFIG.API_BASE_URL;
  }

  /**
   * Get stored auth token
   */
  static getToken() {
    return StorageManager.getToken();
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated() {
    return !!this.getToken();
  }

  /**
   * Make an API request
   * @param {string} endpoint - API path (e.g., '/auth/login')
   * @param {object} options - Fetch options
   * @returns {Promise<object>} Parsed response { success, data, error }
   */
  static async request(endpoint, options = {}) {
    // On GitHub Pages (standalone mode), skip API calls entirely
    if (CONFIG.STANDALONE || !this.getBaseUrl()) {
      throw new ApiError('Offline mode - no backend available', 0, null);
    }
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Attach auth token if available
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(data.error || 'Request failed', response.status, data);
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network error
      throw new ApiError('Network error. Please check your connection.', 0, null);
    }
  }

  /**
   * GET request
   */
  static async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  static async post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * PUT request
   */
  static async put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  // ---- Auth Endpoints ----

  /**
   * Register a new account
   */
  static async register(username, password) {
    const res = await this.post('/auth/register', { username, password });
    if (res.success && res.data.token) {
      StorageManager.saveToken(res.data.token);
      StorageManager.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Login to existing account
   */
  static async login(username, password) {
    const res = await this.post('/auth/login', { username, password });
    if (res.success && res.data.token) {
      StorageManager.saveToken(res.data.token);
      StorageManager.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Migrate guest data to a new account
   */
  static async guestMigrate(username, password, guestData) {
    const res = await this.post('/auth/guest-migrate', {
      username, password, guestData
    });
    if (res.success && res.data.token) {
      StorageManager.saveToken(res.data.token);
      StorageManager.saveUser(res.data.user);
    }
    return res;
  }

  /**
   * Get current user profile from server
   */
  static async getProfile() {
    return this.get('/auth/me');
  }

  /**
   * Logout
   */
  static logout() {
    StorageManager.clearToken();
  }

  // ---- Score Endpoints ----

  /**
   * Submit a game score
   */
  static async submitScore(scoreData) {
    return this.post('/scores/submit', scoreData);
  }

  /**
   * Get leaderboard
   * @param {string} mode - Game mode
   * @param {string} type - 'all' or 'daily'
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   */
  static async getLeaderboard(mode = 'classic', type = 'all', page = 1, limit = 50) {
    return this.get(`/scores/leaderboard?mode=${mode}&type=${type}&page=${page}&limit=${limit}`);
  }

  /**
   * Get personal scores
   */
  static async getPersonalScores() {
    return this.get('/scores/personal');
  }

  // ---- User Endpoints ----

  /**
   * Get user profile
   */
  static async getUserProfile() {
    return this.get('/users/profile');
  }

  /**
   * Update user profile (skin, achievements, etc.)
   */
  static async updateProfile(updates) {
    return this.put('/users/profile', updates);
  }

  /**
   * Sync local data to cloud
   */
  static async syncData(data) {
    return this.post('/users/sync', data);
  }

  /**
   * Get user achievements
   */
  static async getAchievements() {
    return this.get('/users/achievements');
  }
}

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}
