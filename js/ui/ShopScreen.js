'use strict';

/**
 * ShopScreen - Skin store with preview, purchase, and equip functionality
 *
 * Skins are defined in CONFIG.SKINS. User's unlocked skins and active skin
 * are stored in localStorage and synced to cloud when authenticated.
 */
class ShopScreen {
  constructor(screenManager) {
    this.screenManager = screenManager;

    this._init();
  }

  _init() {
    // Refresh on screen change
    window.addEventListener('screenChanged', (e) => {
      if (e.detail.screen === 'shop') {
        this.render();
      }
    });

    // Initial render if shop is active
    if (this.screenManager.currentScreen === 'shop') {
      this.render();
    }
  }

  /**
   * Render the entire shop grid
   */
  render() {
    const grid = document.getElementById('shop-grid');
    const skinData = StorageManager.getSkinData();
    const coins = skinData.coins || 0;

    // Update coins display
    document.getElementById('shop-coins-display').textContent = coins;

    if (!grid) return;

    grid.innerHTML = '';

    for (const skin of CONFIG.SKINS) {
      const isUnlocked = skinData.unlocked && skinData.unlocked.includes(skin.id);
      const isActive = skinData.active === skin.id;

      grid.appendChild(this._buildCard(skin, isUnlocked, isActive, coins));
    }
  }

  /**
   * Build a single skin card
   */
  _buildCard(skin, isUnlocked, isActive, coins) {
    const card = document.createElement('div');
    card.className = 'shop-card';
    if (isActive) card.classList.add('equipped');
    if (!isUnlocked) card.classList.add('locked');

    // Preview canvas
    const preview = document.createElement('canvas');
    preview.className = 'shop-card-preview';
    preview.width = 120;
    preview.height = 60;
    card.appendChild(preview);
    this._drawPreview(preview, skin);

    // Name
    const name = document.createElement('div');
    name.className = 'shop-card-name';
    name.textContent = skin.name;
    card.appendChild(name);

    // Status / Price
    const status = document.createElement('div');
    if (isActive) {
      status.className = 'shop-card-owned';
      status.textContent = '✓ 使用中';
    } else if (isUnlocked) {
      status.className = 'shop-card-owned';
      status.textContent = '已拥有';
    } else {
      status.className = 'shop-card-price';
      status.innerHTML = `🪙 ${skin.price}`;
    }
    card.appendChild(status);

    // Click handler
    card.addEventListener('click', () => this._handleClick(skin, isUnlocked, isActive, coins));

    return card;
  }

  /**
   * Draw rounded rectangle (compatible fallback)
   */
  _fillRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw a detailed snake preview on the card canvas
   */
  _drawPreview(canvas, skin) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const colors = skin.colors;
    const segR = 6;       // segment radius
    const segGap = 11;    // gap between segments
    const startX = 20, startY = h / 2;
    const segCount = 6;

    // Draw subtle grid bg
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < w; gx += 10) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (let gy = 0; gy < h; gy += 10) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

    if (colors.rainbow) {
      const rainbowColors = ['#ff6b6b','#ffa502','#ffd700','#2ed573','#2196f3','#7c4dff'];
      for (let i = segCount - 1; i >= 0; i--) {
        const cx = startX + segGap * i + Math.sin(i * 0.6) * 4;
        const cy = startY + Math.cos(i * 0.5) * 6;
        ctx.fillStyle = rainbowColors[i % 6];
        ctx.shadowColor = rainbowColors[i % 6];
        ctx.shadowBlur = 6;
        this._fillRoundRect(ctx, cx - segR, cy - segR, segR * 2, segR * 2, 3);
      }
      ctx.shadowBlur = 0;
    } else {
      for (let i = segCount - 1; i >= 0; i--) {
        const t = i / (segCount - 1);
        const color = this._lerpColor(colors.head, colors.tail, t);
        const cx = startX + segGap * i + Math.sin(i * 0.5) * 4;
        const cy = startY + Math.cos(i * 0.4) * 4;
        const alpha = i === 0 ? 1 : (0.55 + (1 - t) * 0.45);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = i === 0 ? colors.glow || color : 'transparent';
        ctx.shadowBlur = i === 0 ? 8 : 0;
        this._fillRoundRect(ctx, cx - segR, cy - segR, segR * 2, segR * 2, 3);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Head eyes
      const headCx = startX + segGap * (segCount - 1);
      const headCy = startY;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(headCx - 2, headCy - 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(headCx + 3, headCy - 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(headCx - 1, headCy - 2, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(headCx + 4, headCy - 2, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * OLD mini preview (replaced)
   */
  _drawPreviewOld(canvas, skin) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const colors = skin.colors;
    if (colors.rainbow) {
      // Draw rainbow snake
      const segments = 6;
      const segW = w / segments;
      const colors_r = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'];
      for (let i = 0; i < segments; i++) {
        const x = segW * i + 5;
        ctx.fillStyle = colors_r[i];
        this._fillRoundRect(ctx, x, h / 2 - 6, segW - 4, 12, 4);
      }
    } else {
      // Draw gradient snake
      const segCount = 5;
      const segW = (w - 20) / segCount;
      for (let i = segCount - 1; i >= 0; i--) {
        const t = i / (segCount - 1);
        const color = this._lerpColor(colors.head, colors.tail || colors.bodyEnd, t);
        const x = 15 + segW * i;
        const alpha = 1 - t * 0.5;
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        this._fillRoundRect(ctx, x, h / 2 - 5, segW - 4, 10, 5);
      }
      ctx.globalAlpha = 1;

      // Head eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(15 + segW * 4 + 6, h / 2 - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(15 + segW * 4 + 7, h / 2 - 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Handle skin card click
   */
  _handleClick(skin, isUnlocked, isActive, coins) {
    const skinData = StorageManager.getSkinData();

    if (isActive) {
      // Already equipped
      ScreenManager.showToast('当前正在使用此皮肤', 'info');
      return;
    }

    if (isUnlocked) {
      // Equip
      skinData.active = skin.id;
      StorageManager.saveSkinData(skinData);
      ScreenManager.showToast(`已装备: ${skin.name}`, 'success');
      this.render();

      // Sync to server
      if (ApiClient.isAuthenticated()) {
        ApiClient.updateProfile({ activeSkin: skin.id }).catch(() => {});
      }
      return;
    }

    // Purchase
    if (coins < skin.price) {
      ScreenManager.showToast(`金币不足！需要 ${skin.price} 🪙`, 'error');
      return;
    }

    // Confirm purchase
    if (confirm(`确定花费 ${skin.price} 金币购买「${skin.name}」吗？`)) {
      skinData.coins = coins - skin.price;
      if (!skinData.unlocked) skinData.unlocked = [];
      skinData.unlocked.push(skin.id);
      skinData.active = skin.id;
      StorageManager.saveSkinData(skinData);
      ScreenManager.showToast(`购买成功！已装备: ${skin.name}`, 'success');
      this.render();

      // Sync to server
      if (ApiClient.isAuthenticated()) {
        ApiClient.updateProfile({
          unlockedSkins: skinData.unlocked,
          activeSkin: skin.id,
          coins: skinData.coins
        }).catch(() => {});
      }
    }
  }

  _lerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1, 3), 16);
    const g1 = parseInt(c1.slice(3, 5), 16);
    const b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16);
    const g2 = parseInt(c2.slice(3, 5), 16);
    const b2 = parseInt(c2.slice(5, 7), 16);
    return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
  }
}
