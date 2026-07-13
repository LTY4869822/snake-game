/**
 * ScreenManager - Navigation via sidebar + content sections
 *
 * The app uses a sidebar + content area layout.
 * Sidebar links use `data-nav` to switch content sections.
 * The game screen is a fullscreen overlay controlled separately.
 * Modals are managed the same as before.
 */
class ScreenManager {
  constructor() {
    this.currentSection = 'dashboard';
    this.previousSection = null;
    this.sectionHistory = ['dashboard'];

    // Cache content sections
    this.sections = {
      dashboard: document.getElementById('section-dashboard'),
      'mode-select': document.getElementById('section-mode-select'),
      leaderboard: document.getElementById('section-leaderboard'),
      shop: document.getElementById('section-shop'),
      achievements: document.getElementById('section-achievements'),
      settings: document.getElementById('section-settings')
    };

    // Cache modals
    this.modals = {
      gameover: document.getElementById('modal-gameover'),
      auth: document.getElementById('modal-auth')
    };

    this._setupNavigation();
  }

  /**
   * Set up sidebar nav links and modal close handlers
   */
  _setupNavigation() {
    // Sidebar navigation
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = el.dataset.nav;
        if (target === 'auth') {
          this.openModal('auth');
          return;
        }
        this.navigateTo(target);
      });
    });

    // Also support old data-screen buttons (for backward compat)
    document.querySelectorAll('[data-screen]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateTo(el.dataset.screen);
      });
    });

    // Modal close
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal(el.dataset.close);
      });
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeModal(overlay.id.replace('modal-', ''));
        }
      });
    });
  }

  /**
   * Navigate to a content section or game screen
   * @param {string} target - 'dashboard' | 'mode-select' | 'leaderboard' | 'shop' | 'achievements' | 'settings' | 'game'
   */
  navigateTo(target) {
    // Handle game screen separately
    if (target === 'game') {
      this._hideAllSections();
      document.getElementById('screen-game').classList.add('active');
      document.getElementById('app-shell').style.display = 'none';
      this.previousSection = this.currentSection;
      this.currentSection = 'game';
      this._updateSidebarActive(null);
      window.dispatchEvent(new CustomEvent('screenChanged', { detail: { screen: 'game' } }));
      return;
    }

    // Handle mode-select -> actually starts the game via GameScreen
    if (target === 'mode-select') {
      this._hideAllSections();
      if (this.sections['mode-select']) {
        this.sections['mode-select'].classList.add('active');
      }
      document.getElementById('app-shell').style.display = 'flex';
      document.getElementById('screen-game').classList.remove('active');
      this.previousSection = this.currentSection;
      this.currentSection = 'mode-select';
      this._updateSidebarActive('mode-select');
      window.dispatchEvent(new CustomEvent('screenChanged', { detail: { screen: 'mode-select' } }));
      return;
    }

    // Regular content sections
    this._hideAllSections();
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('screen-game').classList.remove('active');

    if (this.sections[target]) {
      this.sections[target].classList.add('active');
      this.previousSection = this.currentSection;
      this.currentSection = target;
      this.sectionHistory.push(target);
      if (this.sectionHistory.length > 20) this.sectionHistory.shift();
      this._updateSidebarActive(target);
      window.dispatchEvent(new CustomEvent('screenChanged', { detail: { screen: target } }));
    }
  }

  /**
   * Hide all content sections
   */
  _hideAllSections() {
    Object.values(this.sections).forEach(s => {
      if (s) s.classList.remove('active');
    });
  }

  /**
   * Update sidebar active state
   */
  _updateSidebarActive(target) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.dataset.nav === target);
    });
  }

  /**
   * Go back to previous section
   */
  goBack() {
    if (this.sectionHistory.length <= 1) {
      this.navigateTo('dashboard');
      return;
    }
    this.sectionHistory.pop();
    this.navigateTo(this.sectionHistory[this.sectionHistory.length - 1]);
  }

  /**
   * Open a modal
   */
  openModal(modalId) {
    const modal = this.modals[modalId];
    if (!modal) return;
    modal.classList.add('active');
  }

  /**
   * Close a modal
   */
  closeModal(modalId) {
    const modal = this.modals[modalId];
    if (!modal) return;
    modal.classList.remove('active');
  }

  /**
   * Get current section
   */
  getCurrentSection() {
    return this.currentSection;
  }

  /**
   * Show toast notification
   */
  static showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, duration);
  }
}
