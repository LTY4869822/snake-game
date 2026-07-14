/**
 * SettingsScreen - Game settings with sidebar integration
 */
class SettingsScreen {
  constructor(screenManager) {
    this.screenManager = screenManager;
    this._init();
  }

  _init() {
    window.addEventListener('screenChanged', (e) => {
      if (e.detail.screen === 'settings') this._loadSettings();
    });
    if (this.screenManager.getCurrentSection() === 'settings') this._loadSettings();

    // Theme
    const themeBtn = document.getElementById('setting-theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const cycle = { dark: 'light', light: 'cyberpunk', cyberpunk: 'dark' };
        const settings = StorageManager.getSettings();
        const newTheme = cycle[settings.theme] || 'dark';
        settings.theme = newTheme; StorageManager.saveSettings(settings);
        document.body.dataset.theme = newTheme;
        const names = { dark: '暗夜霓虹', light: '清新森系', cyberpunk: '赛博朋克' };
        const icons = { dark: '🌙', light: '☀️', cyberpunk: '🌆' };
        themeBtn.textContent = names[newTheme] || '暗夜霓虹';
        // Sync sidebar button
        const sidebarBtn = document.getElementById('sidebar-theme-btn');
        if (sidebarBtn) {
          sidebarBtn.querySelector('.nav-icon').textContent = icons[newTheme] || '🌙';
          sidebarBtn.querySelector('span:last-child').textContent = names[newTheme] || '暗夜霓虹';
        }
        ScreenManager.showToast('主题已切换', 'success');
      });
    }

    // SFX volume
    document.getElementById('setting-sfx-volume')?.addEventListener('input', function() {
      const s = StorageManager.getSettings(); s.sfxVolume = parseInt(this.value);
      s.soundEnabled = s.sfxVolume > 0;
      StorageManager.saveSettings(s);
      if (AudioManager.instance) AudioManager.instance.setSfxVolume(s.sfxVolume / 100);
    });

    // BGM volume
    document.getElementById('setting-bgm-volume')?.addEventListener('input', function() {
      const s = StorageManager.getSettings(); s.bgmVolume = parseInt(this.value);
      s.musicEnabled = s.bgmVolume > 0;
      StorageManager.saveSettings(s);
      if (AudioManager.instance) AudioManager.instance.setBgmVolume(s.bgmVolume / 100);
    });

    // Control scheme
    document.querySelectorAll('[data-ctrl]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-ctrl]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const s = StorageManager.getSettings(); s.controlScheme = btn.dataset.ctrl; StorageManager.saveSettings(s);
      });
    });

    // Mobile control
    document.querySelectorAll('[data-mobile-ctrl]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-mobile-ctrl]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const s = StorageManager.getSettings(); s.mobileControl = btn.dataset.mobileCtrl; StorageManager.saveSettings(s);
      });
    });

    // Difficulty
    document.querySelectorAll('[data-diff]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-diff]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const s = StorageManager.getSettings(); s.difficulty = btn.dataset.diff; StorageManager.saveSettings(s);
      });
    });

    // Background selector
    this._buildBgSelector();

    // Sync
    document.getElementById('btn-sync-data')?.addEventListener('click', () => this._syncData());

    // Reset
    document.getElementById('btn-reset-data')?.addEventListener('click', () => {
      if (confirm('确定要重置所有本地数据吗？此操作不可撤销！')) {
        StorageManager.resetAll();
        ScreenManager.showToast('所有数据已重置', 'info');
        this.screenManager.navigateTo('dashboard');
      }
    });

    this._setupAuthForm();
  }

  _loadSettings() {
    const s = StorageManager.getSettings();
    document.body.dataset.theme = s.theme || 'dark';
    const themeBtn = document.getElementById('setting-theme-btn');
    const names = { dark: '暗夜霓虹', light: '清新森系', cyberpunk: '赛博朋克' };
    if (themeBtn) themeBtn.textContent = names[s.theme] || '暗夜霓虹';
    const sfx = document.getElementById('setting-sfx-volume'); if (sfx) sfx.value = s.sfxVolume != null ? s.sfxVolume : 70;
    const bgm = document.getElementById('setting-bgm-volume'); if (bgm) bgm.value = s.bgmVolume != null ? s.bgmVolume : 40;
    document.querySelectorAll('[data-ctrl]').forEach(b => b.classList.toggle('active', b.dataset.ctrl === (s.controlScheme || 'wasd')));
    document.querySelectorAll('[data-mobile-ctrl]').forEach(b => b.classList.toggle('active', b.dataset.mobileCtrl === (s.mobileControl || 'swipe')));
    document.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('active', b.dataset.diff === (s.difficulty || 'normal')));
    // Background selection
    this._updateBgSelection(s.bgTheme || 'nebula');

    // Sync audio volumes to AudioManager if initialized
    const am = AudioManager.instance;
    if (am && am.initialized) {
      am.setSfxVolume((s.sfxVolume != null ? s.sfxVolume : 70) / 100);
      am.setBgmVolume((s.bgmVolume != null ? s.bgmVolume : 40) / 100);
      if (s.soundEnabled !== undefined) {
        am.sfxEnabled = s.soundEnabled;
      }
      if (s.musicEnabled !== undefined) {
        am.bgmEnabled = s.musicEnabled;
      }
    }
  }

  _buildBgSelector() {
    const container = document.getElementById('bg-selector');
    if (!container) return;

    const bgDefs = CONFIG.BACKGROUNDS;
    container.innerHTML = '';

    bgDefs.forEach(bg => {
      const chip = document.createElement('button');
      chip.className = 'bg-chip';
      chip.dataset.bg = bg.id;
      chip.innerHTML = `<span class="bg-chip-icon">${bg.icon}</span><span class="bg-chip-name">${bg.name}</span>`;
      chip.addEventListener('click', () => {
        const s = StorageManager.getSettings();
        s.bgTheme = bg.id;
        StorageManager.saveSettings(s);
        this._updateBgSelection(bg.id);
        ScreenManager.showToast(`游戏背景已切换为「${bg.name}」`, 'success');
      });
      container.appendChild(chip);
    });
  }

  _updateBgSelection(bgId) {
    document.querySelectorAll('.bg-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.bg === bgId);
    });
  }

  async _syncData() {
    if (!ApiClient.isAuthenticated()) {
      ScreenManager.showToast('请先登录账号', 'info');
      this.screenManager.openModal('auth'); return;
    }
    try {
      const stats = StorageManager.getStats();
      const skinData = StorageManager.getSkinData();
      const achData = StorageManager.getAchievementData();
      await ApiClient.syncData({ stats, unlockedSkins: skinData.unlocked || [], activeSkin: skinData.active, unlockedAchievements: achData.unlocked || [], coins: skinData.coins || 0 });
      ScreenManager.showToast('数据同步成功！', 'success');
    } catch (err) { ScreenManager.showToast('同步失败: ' + err.message, 'error'); }
  }

  _setupAuthForm() {
    const form = document.getElementById('auth-form'); if (!form) return;
    let authMode = 'login';

    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.tab;
        document.getElementById('auth-submit-btn').textContent = authMode === 'login' ? '登录' : '注册';
        document.getElementById('auth-hint').textContent = authMode === 'login' ? '还没有账号？点击注册' : '已有账号？点击登录';
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('auth-username').value.trim();
      const password = document.getElementById('auth-password').value;
      const errorEl = document.getElementById('auth-error');
      const submitBtn = document.getElementById('auth-submit-btn');

      if (!username || !password) { errorEl.textContent = '请填写用户名和密码'; return; }
      submitBtn.disabled = true; submitBtn.textContent = '处理中...'; errorEl.textContent = '';

      try {
        let res;
        if (authMode === 'login') {
          res = await ApiClient.login(username, password);
        } else {
          const stats = StorageManager.getStats();
          const skinData = StorageManager.getSkinData();
          const achData = StorageManager.getAchievementData();
          res = await ApiClient.guestMigrate(username, password, {
            stats, unlockedSkins: skinData.unlocked || [], activeSkin: skinData.active,
            unlockedAchievements: achData.unlocked || [], coins: skinData.coins || 0
          });
        }
        if (res.success) {
          ScreenManager.showToast(authMode === 'login' ? '登录成功！' : '注册成功！', 'success');
          this.screenManager.closeModal('auth');
          document.getElementById('auth-username').value = '';
          document.getElementById('auth-password').value = '';
          // Update sidebar
          document.getElementById('sidebar-username').textContent = username;
          document.querySelector('.user-status').textContent = '在线模式';
          document.getElementById('sidebar-login-btn').style.display = 'none';
          // Refresh dashboard
          if (typeof AppState !== 'undefined' && AppState.menuScreen) AppState.menuScreen.refreshDashboard();
        }
      } catch (err) {
        errorEl.textContent = err.message || '操作失败';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = authMode === 'login' ? '登录' : '注册';
      }
    });
  }
}
