/**
 * app.js - Application bootstrap
 *
 * Initializes all subsystems with the new sidebar + dashboard layout.
 * The app shell (sidebar + main area) is always visible except during gameplay.
 */
(function () {
  'use strict';

  window.AppState = {
    screenManager: null, menuScreen: null, gameScreen: null,
    gameOverModal: null, leaderboardScreen: null, shopScreen: null,
    achievementScreen: null, settingsScreen: null, audioManager: null,
    initialized: false
  };

  function init() {
    if (AppState.initialized) return;
    AppState.initialized = true;

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

    // Audio is now fully integrated in GameEngine (eat/item/death/combo/BGM)

    // Hide loading, navigate to dashboard
    document.getElementById('loading-overlay').classList.add('hidden');
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
