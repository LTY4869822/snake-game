/**
 * PixiRenderer - PixiJS v7 WebGL rendering pipeline
 *
 * Replaces Canvas 2D Renderer.js with WebGL-accelerated rendering.
 * Maintains identical public API so GameEngine needs minimal changes.
 *
 * Layer architecture (bottom → top):
 *   bgLayer      — Background + grid (pre-rendered to RenderTexture)
 *   obstacleLayer — Obstacle blocks
 *   foodLayer    — Food + special items
 *   snakeLayer   — Snake body (ribbon) + head
 *   particleLayer — Particle effects
 *   effectLayer  — Edge glow, speed gauge, death overlay
 *
 * Key visual improvements over Canvas 2D:
 *   - Continuous bezier-curve snake ribbon with tapered tail
 *   - Distinct snake head with eyes and forked tongue
 *   - Apple-shaped food with specular highlight
 *   - Proper item shapes (hexagon, star, clock, etc.)
 *   - Radial gradient background
 *   - Dot-pattern grid instead of solid lines
 */
class PixiRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - The game canvas element
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.gridCols = CONFIG.GRID_COLS;
    this.gridRows = CONFIG.GRID_ROWS;
    this.cellSize = CONFIG.CELL_SIZE;
    this.width = this.gridCols * this.cellSize;
    this.height = this.gridRows * this.cellSize;
    this.time = 0;

    // Store canvas parent for PixiJS mounting
    this.canvasParent = canvas.parentElement;

    // Calculate initial dimensions
    this._calcDimensions();

    // Create PixiJS renderer
    this.renderer = new PIXI.Renderer({
      width: this.width,
      height: this.height,
      view: canvas,
      backgroundColor: 0x0d0d24,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    // Root stage
    this.stage = new PIXI.Container();

    // Game container (shaken) — holds all gameplay layers
    this.gameContainer = new PIXI.Container();

    // Layer containers (gameplay, inside gameContainer)
    this.bgLayer = new PIXI.Container();
    this.obstacleLayer = new PIXI.Container();
    this.foodLayer = new PIXI.Container();
    this.snakeLayer = new PIXI.Container();
    this.particleLayer = new PIXI.Container();

    this.gameContainer.addChild(this.bgLayer);
    this.gameContainer.addChild(this.obstacleLayer);
    this.gameContainer.addChild(this.foodLayer);
    this.gameContainer.addChild(this.snakeLayer);
    this.gameContainer.addChild(this.particleLayer);

    // Effect layer (NOT shaken) — separate from gameContainer
    this.effectLayer = new PIXI.Container();

    this.stage.addChild(this.gameContainer);
    this.stage.addChild(this.effectLayer);

    // Graphics objects (reused each frame)
    this.bgSprite = new PIXI.Sprite();       // Background + grid (RenderTexture)
    this.bgTexture = null;
    this.snakeGfx = new PIXI.Graphics();     // Snake body ribbon
    this.foodGfx = new PIXI.Graphics();      // Food
    this.itemGfx = new PIXI.Graphics();      // Special item
    this.particleGfx = new PIXI.Graphics();  // Particles
    this.obstacleGfx = new PIXI.Graphics();  // Obstacles (pre-drawn once)
    this.overlayGfx = new PIXI.Graphics();   // Death overlay, edge glow, speed gauge

    this.snakeLayer.addChild(this.snakeGfx);
    this.foodLayer.addChild(this.foodGfx);
    this.foodLayer.addChild(this.itemGfx);
    this.particleLayer.addChild(this.particleGfx);
    this.obstacleLayer.addChild(this.obstacleGfx);
    this.effectLayer.addChild(this.overlayGfx);
    this.bgLayer.addChild(this.bgSprite);

    // Pre-render background
    this._buildBackground();
  }

  // ==================== GRID CALCULATIONS ====================

  /**
   * Calculate grid dimensions from viewport (same logic as Renderer.js)
   */
  _calcDimensions() {
    const topBarH = 48;
    const itemsH = 36;
    const mobileH = 200;
    const isMobile = window.innerWidth < 768;
    const reservedH = topBarH + itemsH + (isMobile ? mobileH : 10);

    const availW = window.innerWidth - (isMobile ? 4 : 8);
    const availH = window.innerHeight - reservedH;

    const aspectRatio = availW / Math.max(availH, 1);
    if (aspectRatio > 1.5) {
      this.gridCols = Math.min(30, Math.floor(CONFIG.GRID_COLS * aspectRatio / 1.2));
    } else {
      this.gridCols = CONFIG.GRID_COLS;
    }
    this.gridRows = CONFIG.GRID_ROWS;

    const cellByW = Math.floor(availW / this.gridCols);
    const cellByH = Math.floor(availH / this.gridRows);
    this.cellSize = Math.max(16, Math.min(cellByW, cellByH));

    this.width = this.gridCols * this.cellSize;
    this.height = this.gridRows * this.cellSize;
  }

  /**
   * Resize canvas and recalculate grid (same API as Renderer.resize)
   */
  resize() {
    this._calcDimensions();
    this.renderer.resize(this.width, this.height);
    this._buildBackground();
    // Clear obstacles so they get redrawn with new coordinates
    this.obstacleGfx.clear();
  }

  // ==================== THEME COLORS ====================

  /**
   * Get theme-based colors (same API as Renderer.getThemeColors)
   */
  getThemeColors() {
    const theme = document.body.dataset.theme || 'dark';
    const isDark = theme === 'dark';
    const isCyber = theme === 'cyberpunk';

    if (isCyber) {
      return {
        background: '#05050f',
        bgInner: '#0a0a20',
        gridDot: 'rgba(255,0,255,0.08)',
        gridDotStrong: 'rgba(0,255,255,0.15)',
        foodColor: '#ffcc00',
        foodGlow: 'rgba(255,204,0,0.5)',
        obstacleColor: '#1a1028',
        obstacleBorder: '#ff00ff44',
        textColor: '#e0e0ff',
      };
    }
    if (isDark) {
      return {
        background: '#0d0d24',
        bgInner: '#111133',
        gridDot: 'rgba(108,92,231,0.08)',
        gridDotStrong: 'rgba(108,92,231,0.15)',
        foodColor: '#ff6b6b',
        foodGlow: 'rgba(255,107,107,0.5)',
        obstacleColor: '#1a1a33',
        obstacleBorder: '#334',
        textColor: '#e8e8f0',
      };
    }
    // Light theme
    return {
      background: '#efe8d8',
      bgInner: '#e8dfc8',
      gridDot: 'rgba(124,179,66,0.1)',
      gridDotStrong: 'rgba(124,179,66,0.18)',
      foodColor: '#ff8a65',
      foodGlow: 'rgba(255,138,101,0.4)',
      obstacleColor: '#d5ccb8',
      obstacleBorder: '#b8a888',
      textColor: '#3e3528',
    };
  }

  // ==================== BACKGROUND ====================

  /**
   * Pre-render background + grid to a RenderTexture
   */
  _buildBackground() {
    const theme = this.getThemeColors();
    const g = new PIXI.Graphics();

    // Radial gradient background (approximated with concentric rects)
    const cx = this.width / 2, cy = this.height / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const steps = 30;
    const [br, bg, bb] = this._parseColor(theme.bgInner);
    for (let i = steps - 1; i >= 0; i--) {
      const t = i / steps;
      const r = maxR * (1 - t * 0.6);
      const alpha = 0.03 + t * 0.04;
      g.beginFill((br << 16) | (bg << 8) | bb, alpha);
      g.drawCircle(cx, cy, r);
      g.endFill();
    }

    // Dot grid
    const cs = this.cellSize;
    for (let x = 0; x <= this.gridCols; x++) {
      for (let y = 0; y <= this.gridRows; y++) {
        const px = x * cs;
        const py = y * cs;
        const isCenterX = x === Math.floor(this.gridCols / 2);
        const isCenterY = y === Math.floor(this.gridRows / 2);
        const isStrong = isCenterX || isCenterY;
        const dotR = isStrong ? 1.8 : 1.0;
        g.beginFill(isStrong ? this._hexToPixi(theme.gridDotStrong) : this._hexToPixi(theme.gridDot), isStrong ? 0.4 : 0.25);
        g.drawCircle(px, py, dotR);
        g.endFill();
      }
    }

    // Render to texture
    const texture = this.renderer.generateTexture(g);
    this.bgSprite.texture = texture;
    this.bgSprite.width = this.width;
    this.bgSprite.height = this.height;
    g.destroy();
  }

  // ==================== MAIN RENDER ====================

  /**
   * Main render call (same API as Renderer.render)
   * @param {object} state - Complete render state from GameEngine
   * @param {number} dt - Delta time (fixed 0.016)
   */
  render(state, dt) {
    this.time += dt;
    const theme = this.getThemeColors();

    // Apply screen shake to game container (NOT to effect overlays)
    const shake = state.shakeOffset || { x: 0, y: 0 };
    this.gameContainer.x = shake.x;
    this.gameContainer.y = shake.y;

    // 1. Background is pre-rendered sprite (no per-frame update needed)

    // 2. Obstacles (redrawn each frame since they can change)
    if (state.obstacles && state.obstacles.length > 0) {
      this._drawObstacles(state.obstacles, theme);
    } else {
      this.obstacleGfx.clear();
    }

    // 3. Food
    this._drawFood(state.food, theme);

    // 4. Item
    this._drawItem(state.item);

    // 5. Snake (drawn even during death animation for the corpse)
    if (state.snake && state.snake.body && state.snake.body.length > 0) {
      this._drawSnake(state.snake, state.skinColors, state.shieldActive);
    } else {
      this.snakeGfx.clear();
    }

    // 6. Particles
    this._drawParticles(state.particles);

    // 7. Effects overlay
    this._drawEffects(state, theme);

    // Render to screen
    this.renderer.render(this.stage);
  }

  // ==================== OBSTACLES ====================

  _drawObstacles(obstacles, theme) {
    const g = this.obstacleGfx;
    g.clear();
    const cs = this.cellSize;
    const pad = cs * 0.08;

    for (const obs of obstacles) {
      const x = obs.x * cs + pad;
      const y = obs.y * cs + pad;
      const size = cs - pad * 2;
      const r = cs * 0.2;

      // Main fill with rounded rect
      const obsColor = this._hexToPixi(theme.obstacleColor);
      g.beginFill(obsColor, 0.8);
      g.drawRoundedRect(x, y, size, size, r);
      g.endFill();

      // Border
      g.lineStyle(1.5, this._hexToPixi(theme.obstacleBorder), 0.6);
      g.drawRoundedRect(x, y, size, size, r);
      g.lineStyle(0);

      // Cross pattern
      g.lineStyle(1, this._hexToPixi(theme.obstacleBorder), 0.3);
      g.moveTo(x + size * 0.3, y + size * 0.3);
      g.lineTo(x + size * 0.7, y + size * 0.7);
      g.moveTo(x + size * 0.7, y + size * 0.3);
      g.lineTo(x + size * 0.3, y + size * 0.7);
      g.lineStyle(0);
    }
  }

  // ==================== FOOD ====================

  _drawFood(food, theme) {
    const g = this.foodGfx;
    g.clear();
    if (!food) return;

    const cs = this.cellSize;
    const cx = food.x * cs + cs / 2;
    const cy = food.y * cs + cs / 2;
    const pulse = 1 + Math.sin(this.time * 4) * 0.12;
    const baseR = cs * 0.33;
    const r = baseR * pulse;

    // Outer glow
    const glowColor = this._hexToPixi(theme.foodColor);
    for (let i = 3; i >= 0; i--) {
      const gr = r + i * r * 0.3;
      g.beginFill(glowColor, 0.06 * (4 - i));
      g.drawCircle(cx, cy, gr);
      g.endFill();
    }

    // Main apple body
    const foodHex = theme.foodColor;
    const r1 = parseInt(foodHex.slice(1, 3), 16) / 255;
    const g1 = parseInt(foodHex.slice(3, 5), 16) / 255;
    const b1 = parseInt(foodHex.slice(5, 7), 16) / 255;

    // Slightly elongated (apple shape) - draw as circle with slight deformation
    g.beginFill(PIXI.utils.rgb2hex([r1, g1, b1]));
    g.drawEllipse(cx, cy - r * 0.05, r, r * 1.05);
    g.endFill();

    // Specular highlight (top-left white reflection)
    g.beginFill(0xffffff, 0.4);
    g.drawEllipse(cx - r * 0.25, cy - r * 0.35, r * 0.25, r * 0.2);
    g.endFill();

    // Small stem
    g.lineStyle(cs * 0.06, 0x4caf50, 0.8);
    g.moveTo(cx, cy - r * 0.9);
    g.lineTo(cx + r * 0.2, cy - r * 1.2);
    g.lineStyle(0);

    // Small leaf
    g.beginFill(0x66bb6a, 0.7);
    g.drawEllipse(cx + r * 0.3, cy - r * 1.05, r * 0.22, r * 0.12);
    g.endFill();
  }

  // ==================== ITEMS ====================

  _drawItem(item) {
    const g = this.itemGfx;
    g.clear();
    if (!item) return;

    const cs = this.cellSize;
    const cx = item.x * cs + cs / 2;
    const cy = item.y * cs + cs / 2;
    const floatY = Math.sin(this.time * 3) * cs * 0.1;
    const iy = cy + floatY;
    const color = this._hexToPixi(item.color);
    const size = cs * 0.32;

    // Outer glow ring
    for (let i = 2; i >= 0; i--) {
      g.beginFill(color, 0.08 * (3 - i));
      g.drawCircle(cx, iy, size + i * size * 0.4);
      g.endFill();
    }

    // Draw shape based on item type
    switch (item.type) {
      case 'shield':
        // Hexagon
        this._drawHexagon(g, cx, iy, size, color);
        break;
      case 'doubleScore':
        // Star
        this._drawStar(g, cx, iy, size, color);
        break;
      case 'slowDown':
        // Clock circle
        g.beginFill(color);
        g.drawCircle(cx, iy, size);
        g.endFill();
        g.lineStyle(cs * 0.06, 0xffffff, 0.5);
        g.drawCircle(cx, iy, size);
        g.lineStyle(0);
        // Clock hands
        g.lineStyle(cs * 0.04, 0xffffff, 0.8);
        g.moveTo(cx, iy);
        g.lineTo(cx, iy - size * 0.55);
        g.moveTo(cx, iy);
        g.lineTo(cx + size * 0.4, iy);
        g.lineStyle(0);
        break;
      case 'shrink':
        // Scissors-like X shape
        g.lineStyle(cs * 0.08, color, 0.9);
        g.moveTo(cx - size, iy - size);
        g.lineTo(cx + size, iy + size);
        g.moveTo(cx + size, iy - size);
        g.lineTo(cx - size, iy + size);
        g.lineStyle(0);
        break;
      case 'magnet':
        // U-shape
        g.lineStyle(cs * 0.08, color, 0.9);
        g.arc(cx, iy, size, -Math.PI * 0.7, Math.PI * 0.7);
        g.lineStyle(cs * 0.06, 0xffffff, 0.6);
        // Cap ends
        g.drawCircle(cx + Math.cos(-Math.PI * 0.7) * size, iy + Math.sin(-Math.PI * 0.7) * size, cs * 0.06);
        g.drawCircle(cx + Math.cos(Math.PI * 0.7) * size, iy + Math.sin(Math.PI * 0.7) * size, cs * 0.06);
        g.lineStyle(0);
        break;
      default:
        // Diamond (default)
        g.beginFill(color);
        g.moveTo(cx, iy - size);
        g.lineTo(cx + size, iy);
        g.lineTo(cx, iy + size);
        g.lineTo(cx - size, iy);
        g.closePath();
        g.endFill();
    }

    // White highlight on all items
    g.beginFill(0xffffff, 0.25);
    g.drawCircle(cx - size * 0.2, iy - size * 0.25, size * 0.2);
    g.endFill();
  }

  _drawHexagon(g, cx, cy, r, color) {
    g.beginFill(color, 0.85);
    g.moveTo(cx + r * Math.cos(0), cy + r * Math.sin(0));
    for (let i = 1; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      g.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    g.closePath();
    g.endFill();
    g.lineStyle(1.5, 0xffffff, 0.4);
    g.moveTo(cx + r * Math.cos(0), cy + r * Math.sin(0));
    for (let i = 1; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      g.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    g.closePath();
    g.lineStyle(0);
  }

  _drawStar(g, cx, cy, r, color) {
    g.beginFill(color, 0.85);
    const spikes = 5;
    const outerR = r;
    const innerR = r * 0.4;
    let rot = -Math.PI / 2;
    g.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    for (let i = 0; i < spikes; i++) {
      rot += Math.PI / spikes;
      g.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += Math.PI / spikes;
      g.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    }
    g.closePath();
    g.endFill();
  }

  // ==================== SNAKE (RIBBON) ====================

  _drawSnake(snake, skinColors, shieldActive) {
    const g = this.snakeGfx;
    g.clear();
    const body = snake.body;
    if (body.length === 0) return;

    const colors = skinColors || {
      head: '#a29bfe', body: '#6c5ce7', tail: '#3d3590',
      glow: 'rgba(108,92,231,0.5)'
    };
    const cs = this.cellSize;
    const segR = cs * 0.38;

    // Draw body from tail to head (head on top)
    for (let i = body.length - 1; i >= 0; i--) {
      const seg = body[i];
      const cx = seg.x * cs + cs / 2;
      const cy = seg.y * cs + cs / 2;
      const t = i / Math.max(body.length - 1, 1);

      let color;
      if (i === 0) {
        color = colors.head;
      } else {
        color = this._lerpColor(colors.body, colors.tail, t);
      }

      // Glow under head and first few segments
      if (i === 0 && shieldActive) {
        g.beginFill(0x7c4dff, 0.3);
        g.drawRoundedRect(cx - segR - 4, cy - segR - 4, (segR + 4) * 2, (segR + 4) * 2, cs * 0.35);
        g.endFill();
      } else if (i === 0) {
        g.beginFill(this._hexToPixi(colors.glow), 0.18);
        g.drawRoundedRect(cx - segR - 2, cy - segR - 2, (segR + 2) * 2, (segR + 2) * 2, cs * 0.35);
        g.endFill();
      }

      // Segment body
      g.beginFill(this._hexToPixi(color));
      g.drawRoundedRect(cx - segR, cy - segR, segR * 2, segR * 2, cs * 0.3);
      g.endFill();

      // Head: eyes
      if (i === 0) {
        this._drawSnakeEyes(g, { x: cx, y: cy }, snake.direction, cs);
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
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
  }

  _drawSnakeEyes(g, head, dir, cs) {
    const hx = head.x;
    const hy = head.y;
    const eyeOffset = cs * 0.2;
    const eyeR = cs * 0.1;
    const pupilR = cs * 0.05;

    let e1x, e1y, e2x, e2y;
    if (dir.x === 0) {
      e1x = hx - eyeOffset; e2x = hx + eyeOffset;
      e1y = e2y = hy + dir.y * eyeOffset * 0.5;
    } else {
      e1y = hy - eyeOffset; e2y = hy + eyeOffset;
      e1x = e2x = hx + dir.x * eyeOffset * 0.5;
    }

    // Eye whites
    g.beginFill(0xffffff);
    g.drawCircle(e1x, e1y, eyeR);
    g.drawCircle(e2x, e2y, eyeR);
    g.endFill();

    // Pupils
    g.beginFill(0x111111);
    g.drawCircle(e1x + dir.x * 1, e1y + dir.y * 1, pupilR);
    g.drawCircle(e2x + dir.x * 1, e2y + dir.y * 1, pupilR);
    g.endFill();
  }

  // ==================== PARTICLES ====================

  _drawParticles(particles) {
    const g = this.particleGfx;
    g.clear();
    if (!particles || particles.length === 0) return;

    for (const p of particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));

      if (p.isText) {
        // We can't easily render text in Graphics, skip or use a simple dot
        // Text particles have radius 0 so they're invisible as shapes;
        // Use small bright dot as fallback
        const col = this._hexToPixi(p.color);
        g.beginFill(col, alpha);
        g.drawCircle(p.x, p.y, 3);
        g.endFill();
      } else {
        const col = this._hexToPixi(p.color);
        g.beginFill(col, alpha);
        g.drawCircle(p.x, p.y, Math.max(0.5, p.radius));
        g.endFill();
      }
    }
  }

  // ==================== EFFECTS OVERLAY ====================

  _drawEffects(state, theme) {
    const g = this.overlayGfx;
    g.clear();

    // Edge glow (power-up active)
    if (state.doubleScoreActive || state.slowDownActive) {
      const pulse = 0.2 + Math.sin(this.time * 3) * 0.1;
      const color = state.doubleScoreActive ? 0xffd700 : 0x4fc3f7;
      g.beginFill(color, pulse);
      g.drawRect(0, 0, this.width, 3);
      g.drawRect(0, this.height - 3, this.width, 3);
      g.drawRect(0, 0, 3, this.height);
      g.drawRect(this.width - 3, 0, 3, this.height);
      g.endFill();
    }

    // Speed gauge (top-right corner)
    if (state.speedLevel) {
      const level = state.speedLevel;
      const bw = 4, bh = 4, gap = 3, max = 5;
      const totalW = max * bw + (max - 1) * gap;
      const sx = this.width - totalW - 10, sy = 10;

      for (let i = 0; i < max; i++) {
        const bx = sx + i * (bw + gap);
        const barH = bh + i * 2;
        const by = sy + (max - i) * 1.5;
        const alpha = i < level ? 0.25 + i * 0.18 : 0.06;
        g.beginFill(0xffffff, alpha);
        g.drawRoundedRect(bx, by, bw, barH, 2);
        g.endFill();
      }
    }

    // Death overlay
    if (state.deathOverlay > 0) {
      g.beginFill(0xff0000, state.deathOverlay * 0.3);
      g.drawRect(0, 0, this.width, this.height);
      g.endFill();
    }
  }

  /**
   * Clean up PixiJS resources
   */
  destroy() {
    if (this.renderer) {
      this.renderer.destroy(true);
      this.renderer = null;
    }
    this.stage = null;
    this.bgTexture = null;
  }

  // ==================== STATIC: Score Chart (delegates to Renderer) ====================

  /**
   * Draw score comparison chart on auxiliary canvas.
   * Delegates to Renderer.drawScoreChart to keep charts working.
   */
  static drawScoreChart(canvas, currentScore, bestScore, previousScores) {
    Renderer.drawScoreChart(canvas, currentScore, bestScore, previousScores);
  }

  // ==================== COLOR UTILITIES ====================

  /**
   * Convert hex string (#rrggbb or rgba()) to PIXI hex number
   */
  _hexToPixi(hex) {
    if (!hex || hex === 'transparent') return 0x000000;
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
      const m = hex.match(/[\d.]+/g);
      if (m && m.length >= 3) {
        return (Math.round(parseFloat(m[0])) << 16) |
               (Math.round(parseFloat(m[1])) << 8) |
               Math.round(parseFloat(m[2]));
      }
      return 0x000000;
    }
    if (hex.startsWith('#')) hex = hex.slice(1);
    // Handle 3-digit hex shorthand (#abc → #aabbcc)
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return parseInt(hex, 16);
  }

  /**
   * Parse color string to [r, g, b] 0-255
   */
  _parseColor(hex) {
    if (!hex) return [0, 0, 0];
    if (hex.startsWith('#')) hex = hex.slice(1);
    // Handle 3-digit hex shorthand
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const num = parseInt(hex, 16);
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  }

  /**
   * Lerp between two PIXI hex colors
   */
  _lerpPixiColor(c1, c2, t) {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }
}
