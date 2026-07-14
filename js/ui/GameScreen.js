/**
 * GameScreen - Game launch, HUD, pause/quit management
 *
 * When game starts: hides sidebar, shows fullscreen game canvas.
 * When game ends/quits: restores sidebar, navigates to dashboard.
 */
class GameScreen {
  constructor(screenManager) {
    this.screenManager = screenManager;
    this.canvas = document.getElementById('game-canvas');
    this.gameEngine = null;
    this.selectedMode = 'classic';
    this.selectedTime = CONFIG.MODE_TIMED_DURATION;

    this._init();
  }

  _init() {
    // Mode card clicks
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.mode-time-btns') || e.target.closest('.time-btn')) return;
        const mode = card.dataset.mode;
        if (mode) {
          this.selectedMode = mode;
          this._startGame();
        }
      });
    });

    // Timed mode time buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedTime = parseInt(btn.dataset.time);
        this.selectedMode = 'timed';
        this._startGame();
      });
    });

    // Pause
    document.getElementById('btn-game-pause').addEventListener('click', () => {
      if (this.gameEngine) {
        const state = this.gameEngine.togglePause();
        document.getElementById('game-pause-overlay').classList.toggle('active', state === 'paused');
      }
    });

    // Resume
    document.getElementById('btn-game-resume').addEventListener('click', () => {
      if (this.gameEngine) {
        this.gameEngine.resume();
        document.getElementById('game-pause-overlay').classList.remove('active');
      }
    });

    // Restart
    document.getElementById('btn-game-restart').addEventListener('click', () => {
      this._startGame();
    });

    // Quit to menu
    document.getElementById('btn-game-quit').addEventListener('click', () => {
      this._quitGame();
    });

    // Sound toggle (cycles: all on → SFX only → BGM only → all off)
    const soundBtn = document.getElementById('btn-game-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const settings = StorageManager.getSettings();
        const am = AppState.audioManager;
        if (!am) return;

        // Cycle through: all on → all off → all on
        const newState = !settings.soundEnabled;
        settings.soundEnabled = newState;
        settings.musicEnabled = newState;
        StorageManager.saveSettings(settings);

        soundBtn.textContent = newState ? '🔊' : '🔇';
        am.setSoundEnabled(newState);
      });
    }

    // Screen change handler
    window.addEventListener('screenChanged', (e) => {
      if (e.detail.screen === 'mode-select') {
        this.selectedMode = 'classic';
      }
    });
  }

  /**
   * Start a new game - hides sidebar, shows game canvas
   */
  _startGame() {
    try {
    const settings = StorageManager.getSettings();
    const skinData = StorageManager.getSkinData();
    const activeSkin = CONFIG.SKINS.find(s => s.id === skinData.active) || CONFIG.SKINS[0];

    // Hide sidebar + main area, show game screen
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('screen-game').classList.add('active');

    // Reset HUD
    document.getElementById('hud-score').textContent = '0';
    document.getElementById('hud-length').textContent = '3';
    document.getElementById('hud-timer-container').style.display = 'none';
    document.getElementById('game-active-items').innerHTML = '';
    document.getElementById('game-pause-overlay').classList.remove('active');

    // Timer visibility for timed mode
    if (this.selectedMode === 'timed') {
      document.getElementById('hud-timer-container').style.display = '';
      document.getElementById('hud-timer').style.color = '';
    }
    // Obstacle level visibility
    const obsContainer = document.getElementById('hud-obstacle-container');
    if (obsContainer) obsContainer.style.display = this.selectedMode === 'obstacle' ? '' : 'none';
    if (obsContainer) document.getElementById('hud-obstacle-level').textContent = '1';
    // Speed gauge
    const speedEl = document.getElementById('hud-speed');
    if (speedEl) speedEl.textContent = '🐢';

    // Cleanup previous engine
    if (this.gameEngine) { this.gameEngine.quit(); }

    // Create engine
    const skinColors = activeSkin.colors || { head: '#a29bfe', body: '#6c5ce7', tail: '#3d3590', glow: 'rgba(108,92,231,0.5)' };

    this.gameEngine = new GameEngine(this.canvas, {
      onScoreUpdate: (score, length) => {
        document.getElementById('hud-score').textContent = score;
        document.getElementById('hud-length').textContent = length;
      },
      onTimerUpdate: (remaining) => {
        document.getElementById('hud-timer').textContent = remaining;
        if (remaining <= 30) document.getElementById('hud-timer').style.color = '#ff4757';
      },
      onGameOver: (result) => {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gameOver', { detail: result }));
        }, 600);
      },
      onItemActivated: (type, item) => { this._showItemIndicator(type, item); },
      onItemExpired: (type) => { this._removeItemIndicator(type); },
      onRespawn: () => { ScreenManager.showToast('已复活！', 'info', 1500); },
      onSpeedUpdate: (level) => { this._updateSpeedGauge(level); },
      onObstacleLevelUpdate: (level) => { this._updateObstacleLevel(level); }
    });

    const modeOptions = {};
    if (this.selectedMode === 'timed') modeOptions.timeLimit = this.selectedTime;

    this.gameEngine.startGame(
      this.selectedMode, modeOptions,
      settings.difficulty || 'normal', skinColors
    );

    const soundBtn = document.getElementById('btn-game-sound');
    if (soundBtn) soundBtn.textContent = settings.soundEnabled ? '🔊' : '🔇';

    } catch (err) {
      console.error('[GameScreen] Start failed:', err);
      ScreenManager.showToast('游戏启动失败: ' + err.message, 'error');
    }
  }

  /**
   * Quit game and return to dashboard
   */
  _quitGame() {
    if (this.gameEngine) { this.gameEngine.quit(); this.gameEngine = null; }
    document.getElementById('screen-game').classList.remove('active');
    document.getElementById('game-pause-overlay').classList.remove('active');
    document.getElementById('app-shell').style.display = 'flex';
    this.screenManager.navigateTo('dashboard');
  }

  /**
   * Show item indicator
   */
  _showItemIndicator(type, item) {
    if (type === 'spawned' || type === 'shrink') return;
    const container = document.getElementById('game-active-items');
    if (!container) return;
    const existing = container.querySelector(`[data-item="${type}"]`);
    if (existing) return;

    const itemDef = CONFIG.ITEM_TYPES.find(t => t.type === type) || { label: type, color: '#fff' };
    const el = document.createElement('div');
    el.className = 'active-item-indicator';
    el.dataset.item = type;
    el.style.color = item.color || itemDef.color;
    el.innerHTML = `<span>${CONFIG.ITEM_ICONS[type] || '◆'}</span><span>${itemDef.label}</span>`;
    container.appendChild(el);
  }

  _removeItemIndicator(type) {
    const container = document.getElementById('game-active-items');
    if (!container) return;
    const el = container.querySelector(`[data-item="${type}"]`);
    if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }
  }

  _updateSpeedGauge(level) {
    const el = document.getElementById('hud-speed');
    if (!el) return;
    const icons = ['🐢', '🐌', '🐍', '💨', '⚡'];
    el.textContent = icons[level - 1] || '⚡';
  }

  _updateObstacleLevel(level) {
    const container = document.getElementById('hud-obstacle-container');
    const el = document.getElementById('hud-obstacle-level');
    if (container) container.style.display = '';
    if (el) el.textContent = level;
  }
}
