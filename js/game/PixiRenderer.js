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
   * @param {string} [bgThemeId] - Background theme ID from CONFIG.BACKGROUNDS
   */
  constructor(canvas, bgThemeId) {
    this.canvas = canvas;
    this.gridCols = CONFIG.GRID_COLS;
    this.gridRows = CONFIG.GRID_ROWS;
    this.cellSize = CONFIG.CELL_SIZE;
    this.width = this.gridCols * this.cellSize;
    this.height = this.gridRows * this.cellSize;
    this.time = 0;
    this.bgThemeId = bgThemeId || 'nebula';

    // Store canvas parent for PixiJS mounting
    this.canvasParent = canvas.parentElement;

    // Calculate initial dimensions
    this._calcDimensions();

    // Get background theme colors for the PixiJS clear color
    const bgDef = CONFIG.BACKGROUNDS.find(b => b.id === this.bgThemeId) || CONFIG.BACKGROUNDS[0];
    const bgClearColor = this._hexToPixi(bgDef.colors.bottom);

    // Verify PIXI is available (CDN may have failed)
    if (typeof PIXI === 'undefined' || typeof PIXI.Renderer === 'undefined') {
      throw new Error('PixiJS 未加载，请检查网络连接后刷新页面');
    }

    // Create PixiJS renderer with WebGL error handling
    try {
      this.renderer = new PIXI.Renderer({
        width: this.width,
        height: this.height,
        view: canvas,
        backgroundColor: bgClearColor,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
    } catch (e) {
      console.error('[PixiRenderer] WebGL init failed, retrying with fallback:', e.message);
      // Retry once with conservative settings
      try {
        this.renderer = new PIXI.Renderer({
          width: this.width,
          height: this.height,
          view: canvas,
          backgroundColor: bgClearColor,
          antialias: false,
          resolution: 1,
          autoDensity: true,
          preserveDrawingBuffer: true,
        });
      } catch (e2) {
        throw new Error('无法初始化游戏图形引擎，请刷新页面后重试 (WebGL不可用)');
      }
    }

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

    // Obstacle caching
    this._lastObstacleHash = '';
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

  /**
   * Change background theme and rebuild
   * @param {string} bgThemeId
   */
  setBackground(bgThemeId) {
    if (this.bgThemeId === bgThemeId) return;
    this.bgThemeId = bgThemeId;
    this._buildBackground();
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
   * Dispatches to theme-specific drawing methods based on bgThemeId
   */
  _buildBackground() {
    const theme = this.getThemeColors();
    const g = new PIXI.Graphics();
    const bgId = this.bgThemeId || 'nebula';

    // Draw base gradient
    this._drawBaseGradient(g, bgId);

    // Draw theme-specific background art
    switch (bgId) {
      case 'nebula': this._drawNebula(g); break;
      case 'ocean': this._drawOcean(g); break;
      case 'sakura': this._drawSakura(g); break;
      case 'aurora': this._drawAurora(g); break;
      case 'cyber': this._drawCyber(g); break;
      case 'sunset': this._drawSunset(g); break;
      case 'bamboo': this._drawBamboo(g); break;
      case 'lava': this._drawLava(g); break;
      default: this._drawNebula(g); break;
    }

    // Draw common grid overlay (subtle dots)
    this._drawGridOverlay(g);

    // Render to texture (with error handling for complex backgrounds)
    try {
      const texture = this.renderer.generateTexture(g);
      this.bgSprite.texture = texture;
      this.bgSprite.width = this.width;
      this.bgSprite.height = this.height;
    } catch (e) {
      console.warn('[PixiRenderer] Background texture generation failed, using simple background:', e.message);
      // Fallback: simple solid color background via a tiny texture
      const fallbackG = new PIXI.Graphics();
      const bgDef = CONFIG.BACKGROUNDS.find(b => b.id === (this.bgThemeId || 'nebula')) || CONFIG.BACKGROUNDS[0];
      fallbackG.beginFill(this._hexToPixi(bgDef.colors.bottom));
      fallbackG.drawRect(0, 0, 2, 2);
      fallbackG.endFill();
      const fbTexture = this.renderer.generateTexture(fallbackG);
      this.bgSprite.texture = fbTexture;
      this.bgSprite.width = this.width;
      this.bgSprite.height = this.height;
      fallbackG.destroy();
    }
    g.destroy();
  }

  /**
   * Draw a vertical gradient from top color to bottom color
   */
  _drawBaseGradient(g, bgId) {
    const w = this.width, h = this.height;
    const bgDef = CONFIG.BACKGROUNDS.find(b => b.id === bgId);
    const c = bgDef ? bgDef.colors : CONFIG.BACKGROUNDS[0].colors;

    // Draw gradient using horizontal strips for smooth transition
    const strips = 60;
    for (let i = 0; i < strips; i++) {
      const t = i / strips;
      const y = h * t;
      const stripH = Math.ceil(h / strips) + 1;

      // Interpolate between top→mid→bottom
      let color;
      if (t < 0.5) {
        color = this._lerpPixiColor(this._hexToPixi(c.top), this._hexToPixi(c.mid), t * 2);
      } else {
        color = this._lerpPixiColor(this._hexToPixi(c.mid), this._hexToPixi(c.bottom), (t - 0.5) * 2);
      }
      g.beginFill(color, 1);
      g.drawRect(0, y, w, stripH);
      g.endFill();
    }
  }

  /**
   * Draw subtle dot grid overlay (common to all backgrounds)
   */
  _drawGridOverlay(g) {
    const cs = this.cellSize;
    const cols = this.gridCols;
    const rows = this.gridRows;
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    for (let x = 0; x <= cols; x++) {
      for (let y = 0; y <= rows; y++) {
        const px = x * cs;
        const py = y * cs;
        const isCenter = x === cx || y === cy;
        const alpha = isCenter ? 0.25 : 0.12;
        const dotR = isCenter ? 1.5 : 0.8;
        g.beginFill(0xffffff, alpha);
        g.drawCircle(px, py, dotR);
        g.endFill();
      }
    }
  }

  // ==================== THEME BACKGROUNDS ====================

  /**
   * Starry Nebula — twinkling stars, nebula clouds, milky way band
   */
  _drawNebula(g) {
    const w = this.width, h = this.height;

    // Nebula clouds (large soft semi-transparent colored regions)
    const nebulae = [
      { x: w * 0.3, y: h * 0.35, rx: w * 0.45, ry: h * 0.3, color: 0x6c5ce7, alpha: 0.06 },
      { x: w * 0.7, y: h * 0.55, rx: w * 0.5, ry: h * 0.35, color: 0x00d2ff, alpha: 0.05 },
      { x: w * 0.25, y: h * 0.6, rx: w * 0.4, ry: h * 0.28, color: 0xa29bfe, alpha: 0.04 },
      { x: w * 0.6, y: h * 0.2, rx: w * 0.35, ry: h * 0.25, color: 0x4834d4, alpha: 0.07 },
      { x: w * 0.5, y: h * 0.7, rx: w * 0.55, ry: h * 0.3, color: 0x00b894, alpha: 0.04 },
    ];
    for (const n of nebulae) {
      this._drawSoftEllipse(g, n.x, n.y, n.rx, n.ry, n.color, n.alpha);
    }

    // Milky way band (diagonal strip of very soft particles)
    const bandCx = w * 0.45, bandCy = h * 0.4;
    const bandAngle = -0.4;
    const bandLen = Math.sqrt(w * w + h * h) * 0.8;
    for (let i = 0; i < 100; i++) {
      const dist = (Math.random() - 0.5) * bandLen;
      const offset = (Math.random() - 0.5) * w * 0.15;
      const bx = bandCx + Math.cos(bandAngle) * dist + Math.cos(bandAngle + Math.PI / 2) * offset;
      const by = bandCy + Math.sin(bandAngle) * dist + Math.sin(bandAngle + Math.PI / 2) * offset;
      if (bx < 0 || bx > w || by < 0 || by > h) continue;
      const r = 1 + Math.random() * 3;
      const alpha = 0.02 + Math.random() * 0.06;
      g.beginFill(0xffffff, alpha);
      g.drawCircle(bx, by, r);
      g.endFill();
    }

    // Stars
    for (let i = 0; i < 300; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const sr = 0.4 + Math.random() * 2.2;
      const alpha = 0.2 + Math.random() * 0.8;
      // Color: white, pale blue, or pale yellow
      const starColors = [0xffffff, 0xaaccff, 0xffffcc, 0xccccff, 0xffeedd];
      const sc = starColors[Math.floor(Math.random() * starColors.length)];
      g.beginFill(sc, alpha);
      g.drawCircle(sx, sy, sr);
      g.endFill();
    }

    // Bright stars with cross glow
    for (let i = 0; i < 12; i++) {
      const bx = Math.random() * w;
      const by = Math.random() * h;
      const colors = [0xffffff, 0xaaccff, 0xffffcc];
      const bc = colors[Math.floor(Math.random() * colors.length)];
      // Cross shape
      const crossLen = 3 + Math.random() * 6;
      const crossW = 0.4 + Math.random() * 0.6;
      g.beginFill(bc, 0.8);
      g.drawRoundedRect(bx - crossLen / 2, by - crossW / 2, crossLen, crossW, crossW / 2);
      g.drawRoundedRect(bx - crossW / 2, by - crossLen / 2, crossW, crossLen, crossW / 2);
      g.endFill();
      // Center dot
      g.beginFill(bc, 1);
      g.drawCircle(bx, by, 1.2 + Math.random() * 1.5);
      g.endFill();
      // Soft glow
      for (let j = 3; j >= 0; j--) {
        g.beginFill(bc, 0.04 * (4 - j));
        g.drawCircle(bx, by, 4 + j * 4);
        g.endFill();
      }
    }
  }

  /**
   * Deep Ocean — light rays, floating particles, caustic effects
   */
  _drawOcean(g) {
    const w = this.width, h = this.height;

    // Caustic patterns (overlapping soft circles in light blue)
    for (let i = 0; i < 60; i++) {
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const r = 15 + Math.random() * 60;
      const alpha = 0.01 + Math.random() * 0.04;
      g.beginFill(0x90e0ef, alpha);
      g.drawEllipse(cx, cy, r, r * (0.3 + Math.random() * 0.7));
      g.endFill();
    }

    // Light rays from top
    for (let i = 0; i < 8; i++) {
      const rayX = w * 0.05 + (w * 0.9 / 7) * i + (Math.random() - 0.5) * 40;
      const rayW = 20 + Math.random() * 40;
      const rayH = h * (0.4 + Math.random() * 0.5);
      const alpha = 0.03 + Math.random() * 0.05;

      // Draw ray as a triangle (wider at bottom, narrow at top)
      g.beginFill(0xffffff, alpha);
      g.moveTo(rayX - 3, 0);
      g.lineTo(rayX + rayW, rayH);
      g.lineTo(rayX - rayW, rayH);
      g.closePath();
      g.endFill();
    }

    // Floating particles (small white dots)
    for (let i = 0; i < 80; i++) {
      const px = Math.random() * w;
      const py = Math.random() * h;
      const pr = 0.5 + Math.random() * 2;
      const alpha = 0.15 + Math.random() * 0.5;
      g.beginFill(0xffffff, alpha);
      g.drawCircle(px, py, pr);
      g.endFill();
    }

    // Seabed terrain at very bottom
    const seabedY = h * 0.85;
    g.beginFill(0x002244, 0.3);
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) {
      const y = seabedY + Math.sin(x * 0.01) * 15 + Math.sin(x * 0.03) * 8 + Math.sin(x * 0.007) * 25;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.endFill();

    // Seaweed silhouettes
    for (let i = 0; i < 5; i++) {
      const sx = w * 0.05 + (w * 0.9 / 4) * i;
      const sh = 30 + Math.random() * 60;
      g.lineStyle(3 + Math.random() * 4, 0x003355, 0.4);
      g.moveTo(sx, h);
      const cp1x = sx + (Math.random() - 0.5) * 30;
      const cp1y = h - sh * 0.5;
      const cp2x = sx + (Math.random() - 0.5) * 20;
      const cp2y = h - sh * 0.8;
      const endX = sx + (Math.random() - 0.5) * 15;
      const endY = h - sh;
      // Quadratic bezier approximation with segments
      for (let t = 0; t <= 1; t += 0.05) {
        const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cp1x + t * t * endX;
        const py = (1 - t) * (1 - t) * h + 2 * (1 - t) * t * cp1y + t * t * endY;
        if (t === 0) continue;
        g.lineTo(px, py);
      }
      g.lineStyle(0);
    }
  }

  /**
   * Sakura Garden — cherry blossom petals, soft bokeh, branch silhouettes
   */
  _drawSakura(g) {
    const w = this.width, h = this.height;

    // Soft bokeh circles (large blurry light spots)
    for (let i = 0; i < 25; i++) {
      const bx = Math.random() * w;
      const by = Math.random() * h * 0.7;
      const br = 20 + Math.random() * 80;
      const colors = [0xfce4ec, 0xf8bbd0, 0xffffff, 0xf48fb1];
      const bc = colors[Math.floor(Math.random() * colors.length)];
      for (let j = 2; j >= 0; j--) {
        g.beginFill(bc, 0.02 * (3 - j));
        g.drawCircle(bx, by, br + j * 15);
        g.endFill();
      }
    }

    // Branch silhouettes (top-left and top-right corners)
    const drawBranch = (startX, startY, endX, endY, thickness) => {
      g.lineStyle(thickness, 0x8d6e63, 0.3);
      g.moveTo(startX, startY);
      const midX = (startX + endX) / 2 + (Math.random() - 0.5) * 60;
      const midY = (startY + endY) / 2 + (Math.random() - 0.5) * 40;
      // Bezier with segments
      const steps = 20;
      for (let t = 0; t <= 1; t += 1 / steps) {
        const px = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX;
        const py = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * endY;
        g.lineTo(px, py);
      }
      g.lineStyle(0);
    };
    drawBranch(0, 0, w * 0.3, h * 0.15, 5);
    drawBranch(w, 0, w * 0.7, h * 0.2, 6);
    drawBranch(0, 0, w * 0.15, h * 0.25, 3);
    drawBranch(w, 0, w * 0.85, h * 0.18, 3);

    // Small branches
    for (let i = 0; i < 6; i++) {
      const sx = (Math.random() < 0.5 ? 0 : w) + (Math.random() - 0.5) * 40;
      const sy = Math.random() * h * 0.15;
      const ex = sx + (sx < w / 2 ? 1 : -1) * (40 + Math.random() * 120);
      const ey = sy + 20 + Math.random() * 80;
      g.lineStyle(1.5 + Math.random() * 2, 0x8d6e63, 0.2);
      g.moveTo(sx, sy);
      g.lineTo(ex, ey);
      g.lineStyle(0);
    }

    // Cherry blossom petals
    for (let i = 0; i < 50; i++) {
      const px = Math.random() * w;
      const py = Math.random() * h * 0.8;
      const petalSize = 3 + Math.random() * 7;
      const petalColors = [0xf8bbd0, 0xf48fb1, 0xfce4ec, 0xf06292, 0xffffff];
      const pc = petalColors[Math.floor(Math.random() * petalColors.length)];
      const alpha = 0.35 + Math.random() * 0.55;
      const angle = Math.random() * Math.PI * 2;

      // Draw petal as a stretched ellipse
      g.beginFill(pc, alpha);
      g.drawEllipse(px, py, petalSize, petalSize * 0.4);
      g.endFill();

      // Sometimes draw a second overlapping petal (flower shape)
      if (Math.random() < 0.3) {
        g.beginFill(pc, alpha * 0.7);
        g.drawEllipse(px, py, petalSize * 0.4, petalSize);
        g.endFill();
      }
    }

    // Ground fading at bottom
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      const y = h * (0.8 + t * 0.2);
      g.beginFill(0xc8e6c9, 0.03 + t * 0.04);
      g.drawRect(0, y, w, Math.ceil(h / 10) + 1);
      g.endFill();
    }
  }

  /**
   * Aurora Night — aurora borealis waves, stars, mountain silhouettes
   */
  _drawAurora(g) {
    const w = this.width, h = this.height;

    // Star field
    for (let i = 0; i < 250; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h * 0.65;
      const sr = 0.3 + Math.random() * 2;
      const alpha = 0.3 + Math.random() * 0.7;
      const colors = [0xffffff, 0xaaffcc, 0xccffdd, 0xeeffff];
      g.beginFill(colors[Math.floor(Math.random() * colors.length)], alpha);
      g.drawCircle(sx, sy, sr);
      g.endFill();
    }

    // Bright stars
    for (let i = 0; i < 8; i++) {
      const bx = Math.random() * w;
      const by = Math.random() * h * 0.5;
      for (let j = 3; j >= 0; j--) {
        g.beginFill(0xffffff, 0.04 * (4 - j));
        g.drawCircle(bx, by, 3 + j * 3);
        g.endFill();
      }
      g.beginFill(0xffffff, 0.9);
      g.drawCircle(bx, by, 1.2);
      g.endFill();
    }

    // Aurora waves (several overlapping bezier curve bands)
    const drawAuroraBand = (baseY, amplitude, color, alpha, thickness) => {
      const segments = 80;
      const segW = w / segments;
      for (let layer = 0; layer < 3; layer++) {
        const layerAlpha = alpha * (0.3 + layer * 0.25);
        const layerThick = thickness + layer * 12;
        g.beginFill(color, layerAlpha);
        g.moveTo(0, baseY);
        for (let i = 0; i <= segments; i++) {
          const x = i * segW;
          const waveY = baseY + Math.sin(i * 0.08 + layer * 0.7) * amplitude * 0.6
                      + Math.sin(i * 0.15 + layer * 1.2) * amplitude * 0.3
                      + Math.sin(i * 0.04) * amplitude * 0.4;
          g.lineTo(x, waveY);
        }
        // Complete the band shape
        for (let i = segments; i >= 0; i--) {
          const x = i * segW;
          const waveY = baseY + Math.sin(i * 0.08 + layer * 0.7) * amplitude * 0.6
                      + Math.sin(i * 0.15 + layer * 1.2) * amplitude * 0.3
                      + Math.sin(i * 0.04) * amplitude * 0.4;
          g.lineTo(x, waveY + layerThick);
        }
        g.closePath();
        g.endFill();
      }
    };

    drawAuroraBand(h * 0.25, 50, 0x00ff88, 0.15, 25);
    drawAuroraBand(h * 0.35, 40, 0x7cffc4, 0.12, 20);
    drawAuroraBand(h * 0.3, 55, 0x00cc66, 0.08, 30);
    drawAuroraBand(h * 0.2, 35, 0x44ffaa, 0.1, 18);

    // Mountain silhouettes at bottom
    g.beginFill(0x0a0a1a, 0.7);
    g.moveTo(0, h);
    const peaks = 12;
    for (let i = 0; i <= peaks; i++) {
      const mx = (w / peaks) * i;
      const mh = h * 0.55 + Math.sin(i * 0.7) * h * 0.2 + Math.sin(i * 1.8) * h * 0.1;
      g.lineTo(mx, mh);
    }
    g.lineTo(w, h);
    g.closePath();
    g.endFill();

    // Second mountain layer (darker, taller)
    g.beginFill(0x050510, 0.5);
    g.moveTo(0, h);
    for (let i = 0; i <= peaks; i++) {
      const mx = (w / peaks) * i;
      const mh = h * 0.6 + Math.sin(i * 1.1) * h * 0.15 + Math.sin(i * 2.3) * h * 0.08;
      g.lineTo(mx, mh);
    }
    g.lineTo(w, h);
    g.closePath();
    g.endFill();
  }

  /**
   * Cyber City — perspective grid, neon glow, scan lines
   */
  _drawCyber(g) {
    const w = this.width, h = this.height;

    // Vanishing point
    const vpX = w / 2, vpY = h * 0.4;

    // Perspective grid lines (converging to vanishing point)
    // Horizontal lines
    for (let i = 0; i < 30; i++) {
      const t = 0.05 + (i / 30) * 1.2;
      const y = vpY + (h - vpY) * Math.pow(t, 1.5);
      if (y > h) break;
      const alpha = 0.04 + (1 - t) * 0.12;
      const lineW = 0.5 + (1 - t) * 1.5;
      g.lineStyle(lineW, 0xff00ff, alpha);
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.lineStyle(0);
    }

    // Vertical lines from vanishing point outward
    for (let i = -15; i <= 15; i++) {
      const angle = (Math.PI / 2) + (i / 15) * (Math.PI * 0.38);
      const endX = vpX + Math.cos(angle) * w * 1.5;
      const endY = vpY + Math.sin(angle) * h * 1.2;
      const alpha = 0.02 + Math.abs(i / 15) * 0.08;
      g.lineStyle(0.5, 0x00ffff, alpha);
      g.moveTo(vpX, vpY);
      g.lineTo(endX, endY);
      g.lineStyle(0);
    }

    // Neon glow at vanishing point
    for (let j = 4; j >= 0; j--) {
      g.beginFill(0xff00ff, 0.03 * (5 - j));
      g.drawCircle(vpX, vpY, 10 + j * 15);
      g.endFill();
    }

    // Scan lines (horizontal thin lines across entire surface)
    for (let y = 0; y < h; y += 3) {
      g.beginFill(0x000000, 0.03);
      g.drawRect(0, y, w, 1);
      g.endFill();
    }

    // Random neon glitch rectangles
    for (let i = 0; i < 8; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h * 0.6;
      const gw = 20 + Math.random() * 80;
      const gh = 1 + Math.random() * 3;
      const gAlpha = 0.05 + Math.random() * 0.15;
      const gColor = Math.random() < 0.5 ? 0xff00ff : 0x00ffff;
      g.beginFill(gColor, gAlpha);
      g.drawRect(gx, gy, gw, gh);
      g.endFill();
    }

    // Building silhouettes at bottom
    g.beginFill(0x0a0a15, 0.5);
    const buildingCount = 20;
    for (let i = 0; i < buildingCount; i++) {
      const bx = (w / buildingCount) * i;
      const bw = (w / buildingCount) + 1;
      const bh = 30 + Math.random() * 80;
      g.drawRect(bx, h - bh, bw, bh);
    }
    g.endFill();

    // Window dots on buildings
    for (let i = 0; i < 60; i++) {
      const wx = Math.random() * w;
      const wy = h - 10 - Math.random() * 70;
      const wAlpha = 0.1 + Math.random() * 0.4;
      const wColor = Math.random() < 0.3 ? 0xff00ff : (Math.random() < 0.5 ? 0x00ffff : 0xffff00);
      g.beginFill(wColor, wAlpha);
      g.drawRect(wx, wy, 2, 2);
      g.endFill();
    }
  }

  /**
   * Sunset Glow — warm gradient with sun, cloud wisps, and distant landscape
   */
  _drawSunset(g) {
    const w = this.width, h = this.height;

    // Sun
    const sunX = w * 0.5, sunY = h * 0.72;
    const sunR = Math.min(w, h) * 0.18;

    // Sun glow layers
    for (let j = 6; j >= 0; j--) {
      const glowR = sunR + j * sunR * 0.5;
      const alpha = 0.03 * (7 - j);
      g.beginFill(0xffd93d, alpha);
      g.drawCircle(sunX, sunY, glowR);
      g.endFill();
    }

    // Sun disc
    for (let j = 3; j >= 0; j--) {
      g.beginFill(0xffd93d, 0.1 * (4 - j));
      g.drawCircle(sunX, sunY, sunR + j * sunR * 0.15);
      g.endFill();
    }
    g.beginFill(0xffee88, 0.7);
    g.drawCircle(sunX, sunY, sunR * 0.7);
    g.endFill();
    g.beginFill(0xffffff, 0.3);
    g.drawCircle(sunX, sunY, sunR * 0.3);
    g.endFill();

    // Cloud wisps
    for (let i = 0; i < 15; i++) {
      const cx = Math.random() * w;
      const cy = h * 0.15 + Math.random() * h * 0.5;
      const cw = 40 + Math.random() * 150;
      const ch = 4 + Math.random() * 12;
      const alpha = 0.04 + Math.random() * 0.1;
      const colors = [0xff6b6b, 0xffd93d, 0xe8784a, 0xffa07a, 0xffffff];
      const cc = colors[Math.floor(Math.random() * colors.length)];

      g.beginFill(cc, alpha);
      g.drawEllipse(cx, cy, cw, ch);
      g.endFill();
    }

    // Distant landscape silhouette
    g.beginFill(0x1a0a2e, 0.5);
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 15) {
      const ly = h * 0.78 + Math.sin(x * 0.004) * 25 + Math.sin(x * 0.011) * 12 + Math.sin(x * 0.002) * 35;
      g.lineTo(x, ly);
    }
    g.lineTo(w, h);
    g.closePath();
    g.endFill();

    // Birds (small V shapes)
    for (let i = 0; i < 5; i++) {
      const bx = w * 0.1 + Math.random() * w * 0.5;
      const by = h * 0.15 + Math.random() * h * 0.2;
      const bSize = 4 + Math.random() * 6;
      g.lineStyle(1, 0x1a0a2e, 0.3);
      g.moveTo(bx - bSize, by + bSize * 0.5);
      g.lineTo(bx, by);
      g.lineTo(bx + bSize, by + bSize * 0.5);
      g.lineStyle(0);
    }
  }

  /**
   * Bamboo Forest — vertical stalks, leaves, soft light spots
   */
  _drawBamboo(g) {
    const w = this.width, h = this.height;

    // Light spots filtering through leaves
    for (let i = 0; i < 30; i++) {
      const lx = Math.random() * w;
      const ly = Math.random() * h;
      const lr = 10 + Math.random() * 50;
      for (let j = 3; j >= 0; j--) {
        g.beginFill(0xffffff, 0.02 * (4 - j));
        g.drawEllipse(lx, ly, lr + j * 12, (lr + j * 12) * 0.6);
        g.endFill();
      }
    }

    // Bamboo stalks
    const stalkCount = 14;
    for (let i = 0; i < stalkCount; i++) {
      const sx = w * 0.02 + (w * 0.96 / (stalkCount - 1)) * i + (Math.random() - 0.5) * 30;
      const sw = 4 + Math.random() * 8;
      const segments = 5 + Math.floor(Math.random() * 8);
      const segH = h / segments;

      for (let s = 0; s < segments; s++) {
        const sy = s * segH;
        // Slight tapering
        const taper = 1 - s * 0.04;
        const currentW = sw * taper;
        const eco = 0x2e7d32;
        const elc = 0x4caf50;
        const color = this._lerpPixiColor(eco, elc, s / segments);

        g.beginFill(color, 0.35);
        g.drawRoundedRect(sx - currentW / 2, sy, currentW, segH + 2, 1);
        g.endFill();

        // Node line (horizontal ring at joint)
        if (s < segments - 1) {
          g.beginFill(0x1b5e20, 0.4);
          g.drawRect(sx - currentW / 2 - 1, sy + segH - 2, currentW + 2, 3);
          g.endFill();
          // Highlight on node
          g.beginFill(0x81c784, 0.2);
          g.drawRect(sx - currentW / 2 + 1, sy + segH - 1, currentW - 2, 1);
          g.endFill();
        }
      }
    }

    // Leaves
    for (let i = 0; i < 40; i++) {
      const lx = Math.random() * w;
      const ly = Math.random() * h * 0.7;
      const lw = 3 + Math.random() * 8;
      const lh = lw * (2 + Math.random() * 3);
      const angle = Math.random() * Math.PI * 2;
      const alpha = 0.15 + Math.random() * 0.3;
      const lc = Math.random() < 0.5 ? 0x4caf50 : 0x81c784;

      g.beginFill(lc, alpha);
      g.drawEllipse(lx, ly, lw, lh);
      g.endFill();
    }

    // Ground
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const y = h * (0.85 + t * 0.15);
      g.beginFill(0x33691e, 0.03 + t * 0.06);
      g.drawRect(0, y, w, Math.ceil(h / 8) + 1);
      g.endFill();
    }
  }

  /**
   * Lava Core — dark rock texture, glowing veins, ember particles
   */
  _drawLava(g) {
    const w = this.width, h = this.height;

    // Dark base with texture
    for (let i = 0; i < 30; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      const rr = 30 + Math.random() * 100;
      g.beginFill(0x0a0000, 0.03);
      g.drawEllipse(rx, ry, rr, rr * (0.4 + Math.random() * 0.6));
      g.endFill();
    }

    // Lava veins
    const drawVein = (startX, startY, endX, endY, color, alpha, thickness) => {
      const midX = (startX + endX) / 2 + (Math.random() - 0.5) * 100;
      const midY = (startY + endY) / 2 + (Math.random() - 0.5) * 80;
      g.lineStyle(thickness, color, alpha);
      g.moveTo(startX, startY);
      const steps = 30;
      for (let t = 0; t <= 1; t += 1 / steps) {
        const px = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX;
        const py = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * endY;
        g.lineTo(px, py);
      }
      g.lineStyle(0);
    };

    // Main lava veins
    const veins = [
      { sx: w * 0.1, sy: 0, ex: w * 0.4, ey: h * 0.4, c: 0xff4500, a: 0.35, t: 3 },
      { sx: w * 0.4, sy: h * 0.4, ex: w * 0.6, ey: h * 0.7, c: 0xff6600, a: 0.3, t: 2.5 },
      { sx: w * 0.6, sy: h * 0.7, ex: w * 0.9, ey: h, c: 0xff4500, a: 0.25, t: 2 },
      { sx: w * 0.8, sy: 0, ex: w * 0.5, ey: h * 0.3, c: 0xff6600, a: 0.3, t: 2.5 },
      { sx: w * 0.3, sy: h * 0.5, ex: 0, ey: h * 0.8, c: 0xff4500, a: 0.2, t: 2 },
      { sx: w * 0.65, sy: h * 0.3, ex: w, ey: h * 0.5, c: 0xff5500, a: 0.25, t: 2 },
    ];
    for (const v of veins) {
      drawVein(v.sx, v.sy, v.ex, v.ey, v.c, v.a, v.t);
    }

    // Small branching veins
    for (let i = 0; i < 20; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const ex = sx + (Math.random() - 0.5) * 150;
      const ey = sy + (Math.random() - 0.5) * 120;
      const alpha = 0.08 + Math.random() * 0.15;
      const colors = [0xff4500, 0xff6600, 0xffa500];
      drawVein(sx, sy, ex, ey, colors[Math.floor(Math.random() * colors.length)], alpha, 0.8 + Math.random() * 1.5);
    }

    // Glow spots (hot spots where veins intersect)
    for (let i = 0; i < 10; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      for (let j = 4; j >= 0; j--) {
        const glowColor = j < 2 ? 0xff6600 : 0xff4500;
        g.beginFill(glowColor, 0.05 * (5 - j));
        g.drawCircle(gx, gy, 4 + j * 7);
        g.endFill();
      }
      g.beginFill(0xffa500, 0.4);
      g.drawCircle(gx, gy, 2 + Math.random() * 3);
      g.endFill();
    }

    // Ember/spark particles
    for (let i = 0; i < 50; i++) {
      const ex = Math.random() * w;
      const ey = Math.random() * h;
      const er = 0.5 + Math.random() * 1.5;
      const ea = 0.2 + Math.random() * 0.6;
      const ec = Math.random() < 0.5 ? 0xff4500 : (Math.random() < 0.5 ? 0xffa500 : 0xff6600);
      g.beginFill(ec, ea);
      g.drawCircle(ex, ey, er);
      g.endFill();
    }
  }

  // ==================== UTILITY ====================

  /**
   * Draw a soft ellipse with radial gradient approximation
   */
  _drawSoftEllipse(g, cx, cy, rx, ry, color, maxAlpha) {
    const layers = 8;
    for (let i = layers - 1; i >= 0; i--) {
      const t = i / layers;
      const lrx = rx * (1 - t * 0.7);
      const lry = ry * (1 - t * 0.7);
      const alpha = maxAlpha * (0.1 + t * 0.9) / layers;
      g.beginFill(color, alpha);
      g.drawEllipse(cx, cy, lrx, lry);
      g.endFill();
    }
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

    // 2. Obstacles (only redraw when they actually change)
    if (state.obstacles && state.obstacles.length > 0) {
      const hash = state.obstacles.map(o => `${o.x},${o.y}`).sort().join(';');
      if (hash !== this._lastObstacleHash) {
        this._lastObstacleHash = hash;
        this._drawObstacles(state.obstacles, theme);
      }
    } else {
      if (this._lastObstacleHash !== '') {
        this._lastObstacleHash = '';
        this.obstacleGfx.clear();
      }
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
    const foodType = food.type || 'normal';

    // Choose colors based on food type
    let foodColor, glowColor, highlightColor;
    if (foodType === 'golden') {
      foodColor = '#ffd700'; glowColor = 'rgba(255,215,0,0.6)'; highlightColor = 0xffd700;
    } else if (foodType === 'poison') {
      foodColor = '#8b00ff'; glowColor = 'rgba(139,0,255,0.5)'; highlightColor = 0x8b00ff;
    } else {
      foodColor = theme.foodColor; glowColor = theme.foodGlow; highlightColor = this._hexToPixi(theme.foodColor);
    }

    // Outer glow
    const glowPixi = this._hexToPixi(glowColor);
    for (let i = 3; i >= 0; i--) {
      const gr = r + i * r * 0.3;
      g.beginFill(glowPixi, 0.06 * (4 - i));
      g.drawCircle(cx, cy, gr);
      g.endFill();
    }

    // Main body
    const r1 = parseInt(foodColor.slice(1, 3), 16) / 255;
    const g1 = parseInt(foodColor.slice(3, 5), 16) / 255;
    const b1 = parseInt(foodColor.slice(5, 7), 16) / 255;
    g.beginFill(PIXI.utils.rgb2hex([r1, g1, b1]));
    g.drawEllipse(cx, cy - r * 0.05, r, r * 1.05);
    g.endFill();

    // Specular highlight
    g.beginFill(0xffffff, 0.4);
    g.drawEllipse(cx - r * 0.25, cy - r * 0.35, r * 0.25, r * 0.2);
    g.endFill();

    if (foodType === 'golden') {
      // Sparkle stars around golden food
      for (let i = 0; i < 4; i++) {
        const angle = this.time * 2 + i * Math.PI / 2;
        const sx = cx + Math.cos(angle) * r * 1.3;
        const sy = cy + Math.sin(angle) * r * 1.3;
        g.beginFill(0xffffff, 0.5 + Math.sin(this.time * 6 + i) * 0.3);
        g.drawCircle(sx, sy, cs * 0.05);
        g.endFill();
      }
    } else if (foodType === 'poison') {
      // X mark on poison food
      g.lineStyle(cs * 0.05, 0xffffff, 0.5);
      const xSize = r * 0.5;
      g.moveTo(cx - xSize, cy - xSize);
      g.lineTo(cx + xSize, cy + xSize);
      g.moveTo(cx + xSize, cy - xSize);
      g.lineTo(cx - xSize, cy + xSize);
      g.lineStyle(0);
    } else {
      // Normal: stem + leaf
      g.lineStyle(cs * 0.06, 0x4caf50, 0.8);
      g.moveTo(cx, cy - r * 0.9);
      g.lineTo(cx + r * 0.2, cy - r * 1.2);
      g.lineStyle(0);
      g.beginFill(0x66bb6a, 0.7);
      g.drawEllipse(cx + r * 0.3, cy - r * 1.05, r * 0.22, r * 0.12);
      g.endFill();
    }
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
