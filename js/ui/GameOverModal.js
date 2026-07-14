'use strict';

/**
 * GameOverModal - Handles the game over result display
 *
 * Shows score breakdown, record comparison, chart, and action buttons.
 * Auto-opens when game ends.
 */
class GameOverModal {
  constructor(screenManager) {
    this.screenManager = screenManager;

    this._init();
  }

  _init() {
    // Listen for game over event
    window.addEventListener('gameOver', (e) => {
      this.show(e.detail);
    });

    // Play again button
    document.getElementById('btn-play-again').addEventListener('click', () => {
      this.screenManager.closeModal('gameover');
      // Restart game directly (game screen still active)
      if (typeof AppState !== 'undefined' && AppState.gameScreen) {
        AppState.gameScreen._startGame();
      }
    });

    // Back to menu button
    document.getElementById('btn-back-to-menu').addEventListener('click', () => {
      this.screenManager.closeModal('gameover');
      // Restore sidebar and go to dashboard
      document.getElementById('screen-game').classList.remove('active');
      document.getElementById('app-shell').style.display = 'flex';
      this.screenManager.navigateTo('dashboard');
    });

    // Share button
    document.getElementById('btn-share-score').addEventListener('click', () => {
      const score = document.getElementById('go-score').textContent;
      this._shareResult(score);
    });
  }

  /**
   * Show game over modal with result data
   * @param {object} result - Game result data from GameEngine
   */
  show(result) {
    // Update stat displays
    document.getElementById('go-score').textContent = result.score;
    document.getElementById('go-length').textContent = result.length;

    const mins = Math.floor(result.duration / 60);
    const secs = result.duration % 60;
    document.getElementById('go-duration').textContent =
      mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;

    // Max combo
    const comboRow = document.getElementById('go-combo-row');
    if (result.maxCombo >= 3) {
      comboRow.style.display = 'flex';
      document.getElementById('go-combo').textContent = `×${result.maxCombo}`;
    } else {
      comboRow.style.display = 'none';
    }

    // New record highlight
    const recordRow = document.getElementById('go-record-row');
    if (result.isNewHighScore && result.score > 0) {
      recordRow.style.display = 'flex';
      document.getElementById('go-record').textContent = `超越历史最高 ${result.highestScore}!`;
    } else {
      recordRow.style.display = 'none';
    }

    // Performance comparison vs average
    const compareRow = document.getElementById('go-compare-row');
    const localScores = StorageManager.getLocalScores()
      .filter(s => s.mode === result.mode);
    if (localScores.length >= 2 && result.score > 0) {
      const scores = localScores.map(s => s.score);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > 0 && result.score !== Math.round(avg)) {
        const diff = result.score - Math.round(avg);
        const diffPct = Math.round(Math.abs(diff) / avg * 100);
        compareRow.style.display = 'flex';
        const el = document.getElementById('go-compare');
        if (diff > 0) {
          el.className = 'gameover-stat-value go-compare-up';
          el.textContent = `↑${diffPct}% (${diff > 0 ? '+' : ''}${diff})`;
        } else {
          el.className = 'gameover-stat-value go-compare-down';
          el.textContent = `↓${diffPct}% (${diff})`;
        }
      } else {
        compareRow.style.display = 'none';
      }
    } else {
      compareRow.style.display = 'none';
    }

    // Coins earned
    document.getElementById('go-coins').textContent = `+${result.coinsEarned}`;

    // Title based on result
    const title = document.getElementById('gameover-title');
    if (result.reason === 'time up') {
      title.textContent = '时间到!';
    } else if (result.isNewHighScore) {
      title.textContent = '🎉 新纪录!';
    } else {
      title.textContent = '游戏结束';
    }

    // Achievement badges in modal
    const achContainer = document.getElementById('go-achievements');
    if (result.achievementsUnlocked && result.achievementsUnlocked.length > 0) {
      achContainer.style.display = 'flex';
      achContainer.innerHTML = result.achievementsUnlocked.map(id => {
        const ach = CONFIG.ACHIEVEMENTS.find(a => a.id === id);
        return ach
          ? `<span class="go-ach-badge">${ach.icon} ${ach.name} <small style="opacity:0.7">+${ach.reward}🪙</small></span>`
          : '';
      }).join('');
    } else {
      achContainer.style.display = 'none';
      achContainer.innerHTML = '';
    }

    // Draw score comparison chart
    const stats = StorageManager.getStats();
    const chartScores = localScores.slice(0, 10).map(s => s.score).reverse();

    const chartCanvas = document.getElementById('go-chart');
    if (chartCanvas) {
      Renderer.drawScoreChart(chartCanvas, result.score, stats.highestScore, chartScores);
    }

    // Also toast achievements
    if (result.achievementsUnlocked && result.achievementsUnlocked.length > 0) {
      const achNames = result.achievementsUnlocked.map(id => {
        const ach = CONFIG.ACHIEVEMENTS.find(a => a.id === id);
        return ach ? ach.name : id;
      });
      setTimeout(() => {
        ScreenManager.showToast(`🏆 解锁成就: ${achNames.join(', ')}`, 'success', 4000);
      }, 800);
    }

    // Open the modal
    this.screenManager.openModal('gameover');
  }

  /**
   * Share score (copy to clipboard + Web Share API)
   */
  _shareResult(score) {
    const shareText = `🐍 我在 Snake Pro 贪吃蛇中获得了 ${score} 分！快来挑战我吧！`;

    if (navigator.share) {
      navigator.share({
        title: 'Snake Pro - 贪吃蛇',
        text: shareText,
        url: window.location.href,
      }).catch(() => {});
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareText).then(() => {
        ScreenManager.showToast('已复制分享文案到剪贴板', 'success');
      }).catch(() => {
        ScreenManager.showToast('分享文案: ' + shareText, 'info', 5000);
      });
    }
  }
}
