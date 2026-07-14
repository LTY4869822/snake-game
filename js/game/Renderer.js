'use strict';

/**
 * Renderer - Canvas rendering pipeline for the entire game
 *
 * Draws in order:
 * 1. Background fill
 * 2. Grid lines (subtle)
 * 3. Obstacles
 * 4. Food (with pulse animation)
 * 5. Items (with glow & float)
 * 6. Snake body (gradient segments + head)
 * 7. Particles (on top of everything)
 * 8. Screen shake offset applied at start, restored at end
 *
 * Theme-aware: reads colors from CONFIG or uses active skin colors.
 */
class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} [bgThemeId] - Background theme ID
   */
  constructor(canvas, bgThemeId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridCols = CONFIG.GRID_COLS;
    this.gridRows = CONFIG.GRID_ROWS;
    this.cellSize = CONFIG.CELL_SIZE;
    this.width = this.gridCols * this.cellSize;
    this.height = this.gridRows * this.cellSize;
    this.time = 0; // For animations
    this.bgThemeId = bgThemeId || 'nebula';

    this.resize();
  }

  /**
   * Resize canvas to match grid dimensions
   */
  resize() {
    // Use full available viewport space for immersive gameplay
    const topBarH = 48;
    const itemsH = 36;
    const mobileH = 200;
    const isMobile = window.innerWidth < 768;
    const reservedH = topBarH + itemsH + (isMobile ? mobileH : 10);

    const availW = window.innerWidth - (isMobile ? 4 : 8);
    const availH = window.innerHeight - reservedH;

    // Adjust grid for widescreen - more columns, same rows
    const aspectRatio = availW / Math.max(availH, 1);
    if (aspectRatio > 1.5) {
      this.gridCols = Math.min(30, Math.floor(CONFIG.GRID_COLS * aspectRatio / 1.2));
    } else {
      this.gridCols = CONFIG.GRID_COLS;
    }
    this.gridRows = CONFIG.GRID_ROWS;

    // Calculate cell size to fill available space
    const cellByW = Math.floor(availW / this.gridCols);
    const cellByH = Math.floor(availH / this.gridRows);
    this.cellSize = Math.max(16, Math.min(cellByW, cellByH));

    this.width = this.gridCols * this.cellSize;
    this.height = this.gridRows * this.cellSize;

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
  }

  /**
   * Get current theme-based colors for the canvas
   */
  getThemeColors() {
    const isDark = document.body.dataset.theme === 'dark';
    return {
      background: isDark ? '#0d0d24' : '#efe8d8',
      gridLine: isDark ? 'rgba(108,92,231,0.06)' : 'rgba(124,179,66,0.08)',
      gridLineStrong: isDark ? 'rgba(108,92,231,0.1)' : 'rgba(124,179,66,0.12)',
      foodColor: isDark ? '#ff6b6b' : '#ff8a65',
      foodGlow: isDark ? 'rgba(255,107,107,0.4)' : 'rgba(255,138,101,0.3)',
      obstacleColor: isDark ? '#334' : '#c8c0b0',
      obstacleBorder: isDark ? '#445' : '#a09888',
      textColor: isDark ? '#e8e8f0' : '#3e3528',
    };
  }

  /**
   * Main render call - draws entire frame
   * @param {object} state - Complete game state
   */
  render(state, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const theme = this.getThemeColors();

    // Apply screen shake
    const shake = state.shakeOffset || { x: 0, y: 0 };
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // 1. Background
    this.drawBackground(theme);

    // 2. Grid
    this.drawGrid(theme);

    // 3. Obstacles
    if (state.obstacles) {
      this.drawObstacles(state.obstacles, theme);
    }

    // 4. Food
    if (state.food) {
      this.drawFood(state.food, theme);
    }

    // 5. Item
    if (state.item) {
      this.drawItem(state.item);
    }

    // 6. Magnet range indicator
    if (state.magnetActive && state.food && state.snakeHead) {
      this.drawMagnetRange(state.snakeHead, state.food);
    }

    // 7. Snake
    if (state.snake) {
      this.drawSnake(state.snake, state.skinColors, state.shieldActive);
    }

    // 8. Particles
    if (state.particles) {
      this.drawParticles(state.particles);
    }

    // 9. Screen edge glow when items active
    if (state.doubleScoreActive || state.slowDownActive) {
      this.drawEdgeGlow(state);
    }

    // 10. Speed gauge
    if (state.speedLevel) {
      this.drawSpeedGauge(state.speedLevel);
    }

    ctx.restore();

    // 11. Death overlay effect
    if (state.deathOverlay > 0) {
      this.drawDeathOverlay(state.deathOverlay);
    }
  }

  /**
   * Draw background with theme support
   */
  drawBackground(theme) {
    const ctx = this.ctx;
    const bgId = this.bgThemeId || 'nebula';
    const bgDef = CONFIG.BACKGROUNDS.find(b => b.id === bgId) || CONFIG.BACKGROUNDS[0];
    const c = bgDef.colors;
    const w = this.width, h = this.height;

    // Vertical gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, c.top);
    grad.addColorStop(0.5, c.mid);
    grad.addColorStop(1, c.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Theme-specific decorations
    if (bgId === 'nebula' || bgId === 'aurora') {
      // Stars
      for (let i = 0; i < 80; i++) {
        const sx = Math.random() * w, sy = Math.random() * h * 0.7;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.3 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (bgId === 'ocean') {
      // Light rays
      for (let i = 0; i < 5; i++) {
        const rx = w * 0.1 + w * 0.8 * i / 4;
        const grad2 = ctx.createLinearGradient(rx, 0, rx, h * 0.5);
        grad2.addColorStop(0, 'rgba(255,255,255,0.06)');
        grad2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad2;
        ctx.beginPath();
        ctx.moveTo(rx - 25 + (i % 2) * 10, 0);
        ctx.lineTo(rx + 35 + (i % 2) * 15, h * 0.55);
        ctx.lineTo(rx - 35 - (i % 2) * 15, h * 0.55);
        ctx.fill();
      }
    }
    if (bgId === 'sakura') {
      // Cherry blossom petals
      for (let i = 0; i < 30; i++) {
        const px = Math.random() * w, py = Math.random() * h * 0.7;
        ctx.fillStyle = `rgba(${240 + Math.random() * 15},${140 + Math.random() * 30},${150 + Math.random() * 30},0.4)`;
        ctx.beginPath();
        ctx.ellipse(px, py, 2 + Math.random() * 5, 1 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (bgId === 'sunset') {
      // Sun
      const sunX = w * 0.5, sunY = h * 0.7, sunR = Math.min(w, h) * 0.15;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR * 1.5);
      sunGrad.addColorStop(0, 'rgba(255,238,136,0.7)');
      sunGrad.addColorStop(0.5, 'rgba(255,217,61,0.2)');
      sunGrad.addColorStop(1, 'rgba(255,107,107,0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    if (bgId === 'bamboo') {
      // Bamboo stalks
      for (let i = 0; i < 6; i++) {
        const bx = w * 0.1 + w * 0.8 * i / 5;
        ctx.strokeStyle = 'rgba(46,125,50,0.2)';
        ctx.lineWidth = 3 + Math.random() * 5;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx + (Math.random() - 0.5) * 10, h);
        ctx.stroke();
      }
    }
    if (bgId === 'lava') {
      // Glow spots
      for (let i = 0; i < 8; i++) {
        const gx = Math.random() * w, gy = Math.random() * h;
        const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 20 + Math.random() * 40);
        gg.addColorStop(0, 'rgba(255,69,0,0.2)');
        gg.addColorStop(1, 'rgba(255,69,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(gx, gy, 40, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /**
   * Draw subtle grid lines
   */
  drawGrid(theme) {
    const ctx = this.ctx;
    const cs = this.cellSize;

    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= this.gridCols; x++) {
      const px = x * cs;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.height);
      ctx.stroke();
    }

    for (let y = 0; y <= this.gridRows; y++) {
      const py = y * cs;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(this.width, py);
      ctx.stroke();
    }

    // Draw stronger lines at grid center cross
    ctx.strokeStyle = theme.gridLineStrong;
    ctx.lineWidth = 1;
    const midX = Math.floor(this.gridCols / 2) * cs;
    const midY = Math.floor(this.gridRows / 2) * cs;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, this.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(this.width, midY);
    ctx.stroke();
  }

  /**
   * Draw obstacles as stone-like blocks
   */
  drawObstacles(obstacles, theme) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const pad = cs * 0.08;

    for (const obs of obstacles) {
      const x = obs.x * cs + pad;
      const y = obs.y * cs + pad;
      const size = cs - pad * 2;

      // Main fill
      ctx.fillStyle = theme.obstacleColor;
      ctx.beginPath();
      this.roundRect(x, y, size, size, cs * 0.2);
      ctx.fill();

      // Border
      ctx.strokeStyle = theme.obstacleBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Cross pattern inside
      ctx.strokeStyle = theme.obstacleBorder;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(x + size * 0.3, y + size * 0.3);
      ctx.lineTo(x + size * 0.7, y + size * 0.7);
      ctx.moveTo(x + size * 0.7, y + size * 0.3);
      ctx.lineTo(x + size * 0.3, y + size * 0.7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw food with pulsing animation
   */
  drawFood(food, theme) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const cx = food.x * cs + cs / 2;
    const cy = food.y * cs + cs / 2;

    // Pulse radius
    const pulse = 1 + Math.sin(this.time * 4) * 0.15;
    const baseRadius = cs * 0.35;
    const radius = baseRadius * pulse;

    // Glow
    const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.8);
    glowGrad.addColorStop(0, theme.foodGlow);
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Main circle
    const foodGrad = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    foodGrad.addColorStop(0, '#ffffff');
    foodGrad.addColorStop(0.3, theme.foodColor);
    foodGrad.addColorStop(1, this.darkenColor(theme.foodColor, 0.5));
    ctx.fillStyle = foodGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw a special item with glow effect
   */
  drawItem(item) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const cx = item.x * cs + cs / 2;
    const cy = item.y * cs + cs / 2;

    // Floating animation
    const floatY = Math.sin(this.time * 3) * cs * 0.1;

    // Glow
    const glowGrad = ctx.createRadialGradient(cx, cy + floatY, cs * 0.15, cx, cy + floatY, cs * 0.7);
    glowGrad.addColorStop(0, item.color);
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy + floatY, cs * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Diamond shape
    const size = cs * 0.3;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + floatY - size);
    ctx.lineTo(cx + size, cy + floatY);
    ctx.lineTo(cx, cy + floatY + size);
    ctx.lineTo(cx - size, cy + floatY);
    ctx.closePath();
    ctx.fill();

    // White highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(cx, cy + floatY - size);
    ctx.lineTo(cx + size * 0.5, cy + floatY);
    ctx.lineTo(cx, cy + floatY);
    ctx.closePath();
    ctx.fill();

    // Icon text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${cs * 0.25}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CONFIG.ITEM_ICONS[item.type] || '?', cx, cy + floatY);
  }

  /**
   * Draw magnet attraction range
   */
  drawMagnetRange(head, food) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const headCx = head.x * cs + cs / 2;
    const headCy = head.y * cs + cs / 2;

    ctx.strokeStyle = 'rgba(255,64,129,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(headCx, headCy, cs * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Draw the entire snake with gradient body segments
   */
  drawSnake(snake, skinColors, shieldActive) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const body = snake.body;
    if (body.length === 0) return;

    const colors = skinColors || {
      head: '#a29bfe',
      body: '#6c5ce7',
      tail: '#3d3590',
      glow: 'rgba(108,92,231,0.5)'
    };

    // Draw body from tail to head (so head renders on top)
    const segmentRadius = cs * 0.38;
    const margin = cs * 0.1;

    for (let i = body.length - 1; i >= 0; i--) {
      const seg = body[i];
      const cx = seg.x * cs + cs / 2;
      const cy = seg.y * cs + cs / 2;

      // Color interpolation along body
      const t = i / Math.max(body.length - 1, 1);
      let color;
      if (i === 0) {
        color = colors.head;
      } else {
        color = this.lerpColor(colors.body, colors.tail, t);
      }

      // Glow effect
      if (i === 0) {
        ctx.shadowColor = colors.glow;
        ctx.shadowBlur = 10;
      } else if (i < 3) {
        ctx.shadowColor = colors.glow;
        ctx.shadowBlur = 5;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      // Shield indicator on head
      if (i === 0 && shieldActive) {
        ctx.shadowColor = '#7c4dff';
        ctx.shadowBlur = 15;
      }

      // Draw segment as rounded rect
      ctx.fillStyle = color;
      ctx.beginPath();
      this.roundRect(cx - segmentRadius, cy - segmentRadius, segmentRadius * 2, segmentRadius * 2, cs * 0.3);
      ctx.fill();

      // Head details (eyes)
      if (i === 0) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        this.drawSnakeEyes(seg, snake, cs);
      }
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Draw eyes on the snake head based on direction
   */
  drawSnakeEyes(head, snake, cs) {
    const ctx = this.ctx;
    const cx = head.x * cs + cs / 2;
    const cy = head.y * cs + cs / 2;
    const dir = snake.direction;
    const eyeOffset = cs * 0.2;
    const eyeRadius = cs * 0.1;
    const pupilRadius = cs * 0.05;

    // Calculate eye positions based on direction
    let eye1X, eye1Y, eye2X, eye2Y;
    if (dir.x === 0) {
      // Moving vertically
      eye1X = cx - eyeOffset;
      eye2X = cx + eyeOffset;
      eye1Y = eye2Y = cy + dir.y * eyeOffset * 0.5;
    } else {
      // Moving horizontally
      eye1Y = cy - eyeOffset;
      eye2Y = cy + eyeOffset;
      eye1X = eye2X = cx + dir.x * eyeOffset * 0.5;
    }

    // Eye whites
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(eye1X + dir.x * 1, eye1Y + dir.y * 1, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X + dir.x * 1, eye2Y + dir.y * 1, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw all particles
   */
  drawParticles(particles) {
    const ctx = this.ctx;

    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);

      if (p.isText) {
        // Floating score text
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      } else {
        // Circle particle
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.radius), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Death fade overlay (red flash)
   */
  drawDeathOverlay(alpha) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.3})`;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw a polished score comparison chart for game over modal
   */
  static drawScoreChart(canvas, currentScore, bestScore, previousScores = []) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const pad = { top: 16, right: 16, bottom: 28, left: 38 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const allScores = [...previousScores.slice(-10), currentScore];
    if (allScores.length < 2) allScores.unshift(0);
    const maxScore = Math.max(bestScore, currentScore, ...allScores) * 1.15 || 100;

    // Chart background
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.roundRect(pad.left, pad.top, pw, ph, 6);
    ctx.fill();

    // Grid lines
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (ph / gridLines) * i;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
      const val = Math.round(maxScore - (maxScore / gridLines) * i);
      ctx.fillText(val, pad.left - 6, y + 3);
    }

    // Area fill under line
    ctx.beginPath();
    const stepX = allScores.length > 1 ? pw / (allScores.length - 1) : pw;
    for (let i = 0; i < allScores.length; i++) {
      const x = pad.left + stepX * i;
      const y = pad.top + ph - (allScores[i] / maxScore) * ph;
      if (i === 0) ctx.moveTo(x, pad.top + ph);
      ctx.lineTo(x, y);
      if (i === allScores.length - 1) ctx.lineTo(x, pad.top + ph);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
    grad.addColorStop(0, 'rgba(108,92,231,0.35)');
    grad.addColorStop(1, 'rgba(108,92,231,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < allScores.length; i++) {
      const x = pad.left + stepX * i;
      const y = pad.top + ph - (allScores[i] / maxScore) * ph;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dots
    for (let i = 0; i < allScores.length; i++) {
      const x = pad.left + stepX * i;
      const y = pad.top + ph - (allScores[i] / maxScore) * ph;
      const isLast = i === allScores.length - 1;
      ctx.fillStyle = isLast ? '#ff6b6b' : '#6c5ce7';
      ctx.beginPath(); ctx.arc(x, y, isLast ? 5 : 3, 0, Math.PI * 2); ctx.fill();
      if (isLast) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      }
      // Highlight current score value
      if (isLast) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(currentScore, x, y - 12);
      }
    }

    // Best score dashed line
    if (bestScore > 0 && bestScore < maxScore) {
      const bestY = pad.top + ph - (bestScore / maxScore) * ph;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(pad.left, bestY); ctx.lineTo(w - pad.right, bestY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd700'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('最佳 ' + bestScore, w - pad.right - 50, bestY - 3);
    }
  }

  // ---- Utility methods ----

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
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
  }

  lerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1, 3), 16);
    const g1 = parseInt(c1.slice(3, 5), 16);
    const b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16);
    const g2 = parseInt(c2.slice(3, 5), 16);
    const b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
  }

  darkenColor(hex, factor) {
    const r = Math.floor(parseInt(hex.slice(1, 3), 16) * factor);
    const g = Math.floor(parseInt(hex.slice(3, 5), 16) * factor);
    const b = Math.floor(parseInt(hex.slice(5, 7), 16) * factor);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * Draw glowing border when power-up items are active
   */
  drawEdgeGlow(state) {
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    const pulse = 0.25 + Math.sin(this.time * 3) * 0.1;
    const color = state.doubleScoreActive
      ? `rgba(255, 215, 0, ${pulse})`
      : `rgba(79, 195, 247, ${pulse})`;

    ctx.fillStyle = color;
    // Top + bottom bars
    ctx.fillRect(0, 0, w, 3);
    ctx.fillRect(0, h - 3, w, 3);
    // Left + right bars
    ctx.fillRect(0, 0, 3, h);
    ctx.fillRect(w - 3, 0, 3, h);
  }

  /**
   * Draw speed gauge (1-5 bars) in top-right corner
   */
  drawSpeedGauge(level) {
    const ctx = this.ctx;
    const bw = 4, bh = 4, gap = 3, max = 5;
    const totalW = max * bw + (max - 1) * gap;
    const x = this.width - totalW - 10, y = 10;

    for (let i = 0; i < max; i++) {
      const bx = x + i * (bw + gap);
      const barH = bh + i * 2;
      const by = y + (max - i) * 1.5;
      ctx.fillStyle = i < level
        ? `rgba(255,255,255,${0.25 + i * 0.18})`
        : 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, barH, 2);
      ctx.fill();
    }
  }
}
