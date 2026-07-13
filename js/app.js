/**
 * app.js - Application bootstrap
 *
 * Initializes all subsystems with the new sidebar + dashboard layout.
 * The app shell (sidebar + main area) is always visible except during gameplay.
 */
(function () {
  'use strict';

  // ---- Loading Snake Animation ----
  let _loadAnimFrame = null;
  function startLoadingAnimation() {
    const canvas = document.getElementById('loading-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const r = 38;
    let angle = 0;
    const bodyLen = 14;
    const trail = [];

    function draw(timestamp) {
      const t = timestamp * 0.001;
      angle = t * 2.5;
      // Snake head position on circle
      const hx = cx + Math.cos(angle) * r;
      const hy = cy + Math.sin(angle) * r;
      trail.unshift({ x: hx, y: hy });
      if (trail.length > bodyLen) trail.length = bodyLen;

      ctx.clearRect(0, 0, w, h);

      // Draw food (center dot)
      const foodPulse = 1 + Math.sin(t * 6) * 0.2;
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(cx, cy, 5 * foodPulse, 0, Math.PI * 2);
      ctx.fill();
      // Food glow
      const fg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
      fg.addColorStop(0, 'rgba(255,107,107,0.4)');
      fg.addColorStop(1, 'transparent');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();

      // Draw snake body
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        const frac = i / trail.length;
        const size = 5 - frac * 3;
        const alpha = 1 - frac * 0.7;
        const r = Math.floor(108 + frac * (108 - 50));
        const g = Math.floor(92 - frac * 60);
        const b = Math.floor(231 - frac * 180);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, size), 0, Math.PI * 2);
        ctx.fill();
      }

      // Eye on head
      if (trail.length > 0) {
        const head = trail[0];
        const eyeOffX = Math.cos(angle) * 1.5;
        const eyeOffY = Math.sin(angle) * 1.5;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(head.x + eyeOffX + 1, head.y + eyeOffY - 1.5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(head.x + eyeOffX - 1, head.y + eyeOffY + 1.5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(head.x + eyeOffX + 1, head.y + eyeOffY - 1.5, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(head.x + eyeOffX - 1, head.y + eyeOffY + 1.5, 1, 0, Math.PI * 2); ctx.fill();
      }

      _loadAnimFrame = requestAnimationFrame(draw);
    }
    _loadAnimFrame = requestAnimationFrame(draw);
  }

  function stopLoadingAnimation() {
    if (_loadAnimFrame) {
      cancelAnimationFrame(_loadAnimFrame);
      _loadAnimFrame = null;
    }
  }

  window.AppState = {
    screenManager: null, menuScreen: null, gameScreen: null,
    gameOverModal: null, leaderboardScreen: null, shopScreen: null,
    achievementScreen: null, settingsScreen: null, audioManager: null,
    initialized: false
  };

  function init() {
    if (AppState.initialized) return;
    AppState.initialized = true;

    // Start loading animation (snake chasing tail)
    startLoadingAnimation();

    // Global error display
    const errorEl = document.createElement('div');
    errorEl.id = 'global-error';
    errorEl.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff0000;color:#fff;padding:10px;z-index:9999;display:none;font-size:12px;text-align:center;';
    document.body.appendChild(errorEl);
    window.addEventListener('error', function(e) {
      if (e.filename && e.filename.includes('snake-game')) {
        errorEl.style.display = 'block';
        errorEl.textContent = 'JS Error: ' + e.message + ' (line ' + e.lineno + ')';
      }
    });

    // Audio
    AppState.audioManager = new AudioManager();

    // Core navigation
    AppState.screenManager = new ScreenManager();

    // UI controllers
    AppState.menuScreen = new MenuScreen(AppState.screenManager);
    AppState.gameScreen = new GameScreen(AppState.screenManager);
    AppState.gameOverModal = new GameOverModal(AppState.screenManager);
    AppState.leaderboardScreen = new LeaderboardScreen(AppState.screenManager);
    AppState.shopScreen = new ShopScreen(AppState.screenManager);
    AppState.achievementScreen = new AchievementScreen(AppState.screenManager);
    AppState.settingsScreen = new SettingsScreen(AppState.screenManager);

    // Audio init on first interaction
    const initAudio = () => {
      if (AppState.audioManager) { AppState.audioManager.init(); AppState.audioManager.startBgm(); }
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('touchstart', initAudio);
    document.addEventListener('keydown', initAudio);

    // Apply saved theme
    const settings = StorageManager.getSettings();
    document.body.dataset.theme = settings.theme || 'dark';

    // Apply sound button state
    const soundBtn = document.getElementById('btn-game-sound');
    if (soundBtn) soundBtn.textContent = settings.soundEnabled ? '🔊' : '🔇';

    // Sidebar collapse toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    // Restore saved state
    const savedCollapsed = StorageManager.get('snake_sidebar_collapsed', false);
    if (savedCollapsed && window.innerWidth >= 901) {
      sidebar.classList.add('collapsed');
    }
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        StorageManager.set('snake_sidebar_collapsed', isCollapsed);
      });
    }

    // Audio is now fully integrated in GameEngine (eat/item/death/combo/BGM)

    // Hide loading, navigate to dashboard
    document.getElementById('loading-overlay').classList.add('hidden');
    stopLoadingAnimation();
    setTimeout(() => { document.getElementById('loading-overlay').style.display = 'none'; }, 400);

    AppState.screenManager.navigateTo('dashboard');

    console.log('[App] Snake Pro initialized');
  }

  // Global logout
  window.logout = function() {
    ApiClient.logout();
    document.getElementById('sidebar-username').textContent = '游客玩家';
    document.querySelector('.user-status').textContent = '离线模式';
    document.getElementById('sidebar-login-btn').style.display = 'flex';
    ScreenManager.showToast('已退出登录', 'info');
  };

  window.__APP = AppState;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
