/**
 * MenuScreen - Dashboard page and global UI management
 *
 * Manages the dashboard home page: stats cards, recent games,
 * achievement preview, theme toggle, and user display.
 */
class MenuScreen {
  constructor(screenManager) {
    this.screenManager = screenManager;
    this.logoCanvas = document.getElementById('logo-canvas');
    this.logoAnimTime = 0;
    this.logoAnimFrame = null;
    this.dashParticles = [];
    this.dashParticleCanvas = null;

    this._init();
  }

  _init() {
    // Refresh dashboard on navigation
    window.addEventListener('screenChanged', (e) => {
      if (e.detail.screen === 'dashboard') {
        this.refreshDashboard();
        this.startLogoAnimation();
        this._startDashParticles();
      } else {
        this.stopLogoAnimation();
        this._stopDashParticles();
      }
    });

    // Update auth display
    this._updateUserDisplay();

    // Initial refresh
    if (this.screenManager.getCurrentSection() === 'dashboard') {
      this.refreshDashboard();
      this.startLogoAnimation();
    }

    // Theme toggle in sidebar
    const themeBtn = document.getElementById('sidebar-theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this._toggleTheme());
    }

    // Auth button
    const loginBtn = document.getElementById('sidebar-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        this.screenManager.openModal('auth');
      });
    }

    // Apply saved theme
    const settings = StorageManager.getSettings();
    document.body.dataset.theme = settings.theme || 'dark';
    this._updateThemeUI(settings.theme || 'dark');
  }

  /**
   * Refresh all dashboard content
   */
  /**
   * Start dashboard particle animation
   */
  _startDashParticles() {
    if (this.dashParticleCanvas) return;
    const mainArea = document.getElementById('main-area');
    if (!mainArea) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'dash-particles';
    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0.6;';
    this.dashParticleCanvas = canvas;
    mainArea.style.position = mainArea.style.position || 'relative';
    mainArea.appendChild(canvas);

    const resize = () => {
      canvas.width = mainArea.clientWidth;
      canvas.height = mainArea.clientHeight;
      this.dashParticles = Array.from({length: 30}, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15 - 5,
        r: 1 + Math.random() * 2.5,
        alpha: 0.15 + Math.random() * 0.3,
        pulse: Math.random() * Math.PI * 2
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    const animate = (ts) => {
      if (!this.dashParticleCanvas) return;
      const t = ts * 0.001;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isDark = document.body.dataset.theme === 'dark';
      const baseColor = isDark ? '108,92,231' : '124,179,66';
      for (const p of this.dashParticles) {
        p.x += p.vx * 0.016; p.y += p.vy * 0.016;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < -20) p.y = canvas.height + 20;
        if (p.y > canvas.height + 20) p.y = -20;
        const a = p.alpha * (0.5 + 0.5 * Math.sin(t * 1.5 + p.pulse));
        ctx.fillStyle = `rgba(${baseColor},${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      this._dashParticleFrame = requestAnimationFrame(animate);
    };
    this._dashParticleFrame = requestAnimationFrame(animate);
  }

  _stopDashParticles() {
    if (this._dashParticleFrame) { cancelAnimationFrame(this._dashParticleFrame); this._dashParticleFrame = null; }
    if (this.dashParticleCanvas) { this.dashParticleCanvas.remove(); this.dashParticleCanvas = null; }
  }

  refreshDashboard() {
    const stats = StorageManager.getStats();
    const skinData = StorageManager.getSkinData();
    const achData = StorageManager.getAchievementData();

    // Stats cards
    document.getElementById('dash-highscore').textContent = stats.highestScore;
    document.getElementById('dash-games').textContent = stats.totalGames;
    document.getElementById('dash-coins').textContent = skinData.coins || 0;
    const hours = Math.floor((stats.totalPlayTime || 0) / 3600);
    const mins = Math.floor(((stats.totalPlayTime || 0) % 3600) / 60);
    document.getElementById('dash-playtime').textContent =
      hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    // Recent games
    this._renderRecentGames();

    // Achievement progress
    const achUnlocked = (achData.unlocked || []).length;
    const achTotal = CONFIG.ACHIEVEMENTS.length;
    document.getElementById('ach-mini-fill').style.width = `${(achUnlocked / achTotal) * 100}%`;
    document.getElementById('ach-mini-text').textContent = `${achUnlocked} / ${achTotal}`;

    // Achievement icons
    const iconContainer = document.getElementById('ach-mini-icons');
    if (iconContainer) {
      const unlockedIds = new Set((achData.unlocked || []).map(a => a.id || a));
      iconContainer.innerHTML = CONFIG.ACHIEVEMENTS.slice(0, 8).map(a =>
        `<span class="ach-mini-icon ${unlockedIds.has(a.id) ? 'unlocked' : ''}" title="${a.name}">${a.icon}</span>`
      ).join('');
    }

    // Update username
    const user = StorageManager.getUser();
    document.getElementById('dash-username').textContent = user ? user.username : '玩家';
    this._updateUserDisplay();
  }

  /**
   * Render recent games list
   */
  _renderRecentGames() {
    const container = document.getElementById('recent-games-list');
    if (!container) return;

    const scores = StorageManager.getLocalScores().slice(0, 5);

    if (scores.length === 0) {
      container.innerHTML = '<p class="empty-hint">还没有游戏记录，快来一局吧！</p>';
      return;
    }

    const modeNames = { classic: '经典', timed: '限时', obstacle: '障碍', wallpass: '穿墙', endless: '无尽' };
    container.innerHTML = scores.map(s => {
      const d = new Date(s.date);
      const timeStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return `
        <div class="recent-item">
          <span class="ri-mode">${modeNames[s.mode] || s.mode}</span>
          <span class="ri-score">${s.score}</span>
          <span class="ri-time">${timeStr}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Update user display in sidebar
   */
  _updateUserDisplay() {
    const user = StorageManager.getUser();
    const nameEl = document.getElementById('sidebar-username');
    const statusEl = document.querySelector('.user-status');
    const loginBtn = document.getElementById('sidebar-login-btn');

    if (user && user.username) {
      if (nameEl) nameEl.textContent = user.username;
      if (statusEl) statusEl.textContent = '在线模式';
      if (loginBtn) loginBtn.style.display = 'none';
    } else {
      if (nameEl) nameEl.textContent = '游客玩家';
      if (statusEl) statusEl.textContent = '离线模式';
      if (loginBtn) loginBtn.style.display = 'flex';
    }
  }

  /**
   * Cycle theme: dark → light → cyberpunk → dark
   */
  _toggleTheme() {
    const cycle = { dark: 'light', light: 'cyberpunk', cyberpunk: 'dark' };
    const current = document.body.dataset.theme || 'dark';
    const newTheme = cycle[current] || 'dark';
    document.body.dataset.theme = newTheme;

    const settings = StorageManager.getSettings();
    settings.theme = newTheme;
    StorageManager.saveSettings(settings);

    this._updateThemeUI(newTheme);
  }

  _updateThemeUI(theme) {
    const themeInfo = {
      dark: { icon: '🌙', name: '暗夜霓虹' },
      light: { icon: '☀️', name: '清新森系' },
      cyberpunk: { icon: '🌆', name: '赛博朋克' }
    };
    const info = themeInfo[theme] || themeInfo.dark;

    const btn = document.getElementById('sidebar-theme-btn');
    if (btn) {
      const icon = btn.querySelector('.nav-icon');
      const text = btn.querySelector('span:last-child');
      if (icon) icon.textContent = info.icon;
      if (text) text.textContent = info.name;
    }
    const settingBtn = document.getElementById('setting-theme-btn');
    if (settingBtn) {
      settingBtn.textContent = info.name;
    }
  }

  /**
   * Logo canvas animation
   */
  startLogoAnimation() {
    if (this.logoAnimFrame) return;
    const canvas = this.logoCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (timestamp) => {
      this.logoAnimTime = timestamp * 0.001;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2, cy = canvas.height / 2;
      const t = this.logoAnimTime;
      const segments = 6, spacing = 8;

      for (let i = segments - 1; i >= 0; i--) {
        const phase = t * 2.5 - i * 0.5;
        const x = cx - 20 + i * spacing + Math.sin(phase) * 10;
        const y = cy + Math.cos(phase * 0.7) * 6;
        const alpha = 1 - (i / segments) * 0.7;
        const size = 5 - i * 0.4;
        ctx.fillStyle = `rgba(108,92,231,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, size), 0, Math.PI * 2);
        ctx.fill();
        if (i === 0) {
          ctx.fillStyle = 'rgba(162,155,254,0.9)';
          ctx.beginPath();
          ctx.arc(x, y, size + 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.logoAnimFrame = requestAnimationFrame(loop);
    };
    this.logoAnimFrame = requestAnimationFrame(loop);
  }

  stopLogoAnimation() {
    if (this.logoAnimFrame) {
      cancelAnimationFrame(this.logoAnimFrame);
      this.logoAnimFrame = null;
    }
  }
}
