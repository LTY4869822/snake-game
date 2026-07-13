/**
 * AchievementScreen - Achievement grid with ring progress chart
 */
class AchievementScreen {
  constructor(screenManager) {
    this.screenManager = screenManager;
    this._init();
  }

  _init() {
    window.addEventListener('screenChanged', (e) => {
      if (e.detail.screen === 'achievements') this.render();
    });
    if (this.screenManager.getCurrentSection() === 'achievements') this.render();
  }

  render() {
    const achData = StorageManager.getAchievementData();
    const unlockedIds = new Set((achData.unlocked || []).map(a => a.id || a));
    const total = CONFIG.ACHIEVEMENTS.length;
    const unlocked = unlockedIds.size;
    const pct = (unlocked / total) * 100;

    // SVG ring
    const ring = document.getElementById('ach-ring');
    if (ring) {
      const circumference = 2 * Math.PI * 42; // r=42
      ring.setAttribute('stroke-dasharray', circumference);
      ring.setAttribute('stroke-dashoffset', circumference * (1 - unlocked / total));
    }
    const ringText = document.getElementById('ach-ring-text');
    if (ringText) ringText.textContent = `${unlocked}/${total}`;

    const countText = document.getElementById('ach-count-text');
    if (countText) countText.textContent = `${unlocked} 项已解锁`;

    // Grid
    const grid = document.getElementById('ach-grid');
    if (!grid) return;
    grid.innerHTML = CONFIG.ACHIEVEMENTS.map(a => {
      const isUnlocked = unlockedIds.has(a.id);
      return `
        <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <div class="ach-icon">${isUnlocked ? a.icon : '🔒'}</div>
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
          <div class="ach-reward">${isUnlocked ? '✅ 已解锁' : `奖励 ${a.reward} 🪙`}</div>
        </div>
      `;
    }).join('');
  }
}
