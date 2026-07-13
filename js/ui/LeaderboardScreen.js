/**
 * LeaderboardScreen - Local and global leaderboard display
 * Supports mode filtering, pagination, and daily/all-time toggle
 */
class LeaderboardScreen {
  constructor(screenManager) {
    this.screenManager = screenManager;
    this.currentTab = 'local';    // 'local' | 'global'
    this.currentMode = 'classic';
    this.currentPage = 1;

    this._init();
  }

  _init() {
    // Tab switching
    document.querySelectorAll('[data-lb-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-lb-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.lbTab;
        this.currentPage = 1;
        this.loadLeaderboard();
      });
    });

    // Mode filter buttons
    document.querySelectorAll('[data-lb-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-lb-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentMode = btn.dataset.lbMode;
        this.currentPage = 1;
        this.loadLeaderboard();
      });
    });

    // Refresh on screen change
    window.addEventListener('screenChanged', (e) => {
      if (e.detail.screen === 'leaderboard') {
        this.loadLeaderboard();
      }
    });
  }

  /**
   * Load leaderboard data based on current tab and mode
   */
  async loadLeaderboard() {
    const list = document.getElementById('lb-list');
    if (!list) return;

    list.innerHTML = '<div class="lb-empty">加载中...</div>';

    if (this.currentTab === 'local') {
      this._renderLocal();
    } else {
      await this._renderGlobal();
    }
  }

  /**
   * Render local leaderboard from localStorage
   */
  _renderLocal() {
    const list = document.getElementById('lb-list');
    const scores = StorageManager.getLocalScores()
      .filter(s => s.mode === this.currentMode)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    if (scores.length === 0) {
      list.innerHTML = '<div class="lb-empty">暂无本地记录，快去游戏中创造记录吧！</div>';
      document.getElementById('lb-pagination').innerHTML = '';
      return;
    }

    list.innerHTML = scores.map((s, i) => this._buildRow(i + 1, '你', s.score, s.length, s.duration, s.date)).join('');
    document.getElementById('lb-pagination').innerHTML = '';
  }

  /**
   * Render global leaderboard from API
   */
  async _renderGlobal() {
    const list = document.getElementById('lb-list');

    try {
      const res = await ApiClient.getLeaderboard(this.currentMode, 'all', this.currentPage, 30);
      if (!res.success || !res.data) {
        throw new Error('Failed to load leaderboard');
      }

      const { scores, pagination } = res.data;

      if (scores.length === 0) {
        list.innerHTML = '<div class="lb-empty">暂无全球排行数据</div>';
        return;
      }

      list.innerHTML = scores.map(s =>
        this._buildRow(s.rank, s.username, s.score, s.length, s.duration, s.createdAt)
      ).join('');

      // Pagination
      this._renderPagination(pagination);
    } catch (err) {
      list.innerHTML = '<div class="lb-empty">无法加载全球排行，请确保后端服务已启动</div>';
      document.getElementById('lb-pagination').innerHTML = '';
    }
  }

  /**
   * Build a single leaderboard row HTML
   */
  _buildRow(rank, username, score, length, duration, date) {
    // Rank display
    let rankHtml = '';
    if (rank === 1) rankHtml = '<span class="lb-rank-icon">🥇</span>';
    else if (rank === 2) rankHtml = '<span class="lb-rank-icon">🥈</span>';
    else if (rank === 3) rankHtml = '<span class="lb-rank-icon">🥉</span>';
    else rankHtml = `<span class="lb-rank">${rank}</span>`;

    // Format duration
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;

    // Format date
    let dateStr = '';
    if (date) {
      const d = new Date(date);
      dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    const glowClass = rank <= 3 ? ` lb-glow-${rank}` : '';
    return `
      <div class="lb-row${glowClass}">
        ${rankHtml}
        <div class="lb-info">
          <div class="lb-username">${this._escapeHtml(username)}</div>
          <div class="lb-meta">长度 ${length} · ${durStr} · ${dateStr}</div>
        </div>
        <div class="lb-score">${score}</div>
      </div>
    `;
  }

  /**
   * Render pagination controls
   */
  _renderPagination(pagination) {
    const container = document.getElementById('lb-pagination');
    if (!container || pagination.pages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }

    let html = '';
    if (pagination.page > 1) {
      html += `<button class="btn btn-sm btn-outline" data-lb-page="${pagination.page - 1}">上一页</button>`;
    }
    html += `<span class="lb-page-info">${pagination.page} / ${pagination.pages}</span>`;
    if (pagination.page < pagination.pages) {
      html += `<button class="btn btn-sm btn-outline" data-lb-page="${pagination.page + 1}">下一页</button>`;
    }
    container.innerHTML = html;

    // Attach click handlers
    container.querySelectorAll('[data-lb-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentPage = parseInt(btn.dataset.lbPage);
        this.loadLeaderboard();
      });
    });
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
