/**
 * GameEngine - Core game loop and state machine
 *
 * Orchestrates Snake, FoodManager, Renderer, ParticleSystem, and InputManager.
 * Uses requestAnimationFrame for rendering and a fixed-timestep accumulator
 * for game logic ticks.
 *
 * State machine: countdown → playing → paused ↔ playing → dead → (game over)
 *
 * Emits events to the UI layer via callback hooks.
 */
'use strict';

class GameEngine {
  /**
   * @param {HTMLCanvasElement} canvas - Game canvas element
   * @param {object} hooks - UI callback hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;

    const settings = StorageManager.getSettings();
    const bgThemeId = settings.bgTheme || 'nebula';
    this.renderer = new PixiRenderer(canvas, bgThemeId);
    this.particles = new ParticleSystem();
    this.snake = null;
    this.foodManager = null;
    this.inputManager = null;

    // Game state
    this.state = 'ready';  // ready | playing | paused | dead
    this.mode = 'classic';
    this.modeConfig = null;
    this.difficulty = 'normal';

    // Timing
    this.lastFrameTime = 0;
    this.tickAccumulator = 0;
    this.tickInterval = 150;       // Current ms per game tick
    this.gameTime = 0;             // Total game time in seconds
    this.foodEaten = 0;

    // Active skin
    this.skinColors = null;

    // Obstacles (obstacle mode)
    this.obstacles = [];

    // Timer (timed mode)
    this.timeRemaining = 0;

    // Shields (endless mode)
    this.shieldCount = 0;

    // Respawns (timed mode)
    this.respawnsLeft = 0;

    // Score
    this.score = 0;

    // Combo tracking
    this.comboCount = 0;
    this.maxCombo = 0;

    // Death overlay animation
    this.deathOverlayAlpha = 0;
    this.deathAnimationTime = 0;
    this.deathAnimating = false;   // true during death animation phase
    this.deathStartTime = 0;       // timestamp when death began
    this._deathTimers = [];        // Track setTimeout IDs for cleanup

    // Obstacle progression
    this.obstacleLevel = 1;
    this.foodSinceLastObstacle = 0;

    // Speed gauge
    this.speedLevel = 1;
    this.maxSpeedLevel = 5;

    // Trailing particle timer
    this.trailTimer = 0;

    // Countdown (3-2-1-GO before game starts)
    this.countdownValue = 0;
    this.countdownTimer = 0;

    // Animation frame ID
    this.animFrameId = null;

    // Bound loop method
    this._loop = this._loop.bind(this);
  }

  /**
   * Initialize and start a new game
   * @param {string} mode - Game mode
   * @param {object} modeOptions - Mode-specific options
   * @param {string} difficulty - 'easy' | 'normal' | 'hard'
   * @param {object} skinColors - Active skin color definition
   */
  startGame(mode, modeOptions = {}, difficulty = 'normal', skinColors = null) {
    // Reset subsystems
    this.particles.reset();

    // Set up mode config
    this.mode = mode;
    this.modeConfig = GameModes.getConfig(mode, modeOptions);
    this.difficulty = difficulty;

    // Set up difficulty
    const diff = CONFIG.DIFFICULTY[difficulty] || CONFIG.DIFFICULTY.normal;
    this.tickInterval = diff.initialSpeed;
    this.difficultyConfig = diff;

    // Create snake at center
    const startX = Math.floor(this.renderer.gridCols / 2);
    const startY = Math.floor(this.renderer.gridRows / 2);
    this.snake = new Snake(startX, startY, CONFIG.SNAKE_INITIAL_LENGTH);

    // Food manager
    this.foodManager = new FoodManager(this.renderer.gridCols, this.renderer.gridRows);

    // Obstacles
    this.obstacles = [];
    if (this.modeConfig.hasObstacles) {
      this.obstacles = GameModes.generateObstacles(
        this.modeConfig.obstacleCount,
        this.snake,
        this.renderer.gridCols,
        this.renderer.gridRows,
        1
      );
    }

    // Shields
    this.shieldCount = this.modeConfig.initialShields || 0;

    // Respawns
    this.respawnsLeft = this.modeConfig.respawnsLeft || 0;

    // Timer
    this.timeRemaining = this.modeConfig.timeLimit || 0;

    // Reset tracking
    this.gameTime = 0;
    this.foodEaten = 0;
    this.score = 0;
    this.comboCount = 0;
    this.maxCombo = 0;
    this.tickAccumulator = 0;
    this.deathOverlayAlpha = 0;
    this.deathAnimationTime = 0;
    this.trailTimer = 0;

    // Skin
    this.skinColors = skinColors;

    // Spawn initial food
    this.foodManager.spawnFood(this.snake, this.obstacles);

    // Set up input
    if (this.inputManager) {
      this.inputManager.destroy();
    }

    const settings = StorageManager.getSettings();
    this.inputManager = new InputManager({
      controlScheme: settings.controlScheme || 'wasd',
      mobileControl: settings.mobileControl || 'swipe',
      canvasElement: this.canvas,
      onDirection: (dx, dy) => this._handleDirection(dx, dy),
      onPause: () => this.togglePause(),
      onRestart: () => { if (this.state === 'dead' && this.hooks.onGameOver) { this._finalizeDeath(); this.hooks.onGameOver({ restart: true }); } },
      onQuit: () => { if (this.hooks.onGameOver) { this._finalizeDeath(); this.hooks.onGameOver({ quit: true }); } }
    });

    // Start 3-2-1 countdown before gameplay
    this.state = 'countdown';
    this.countdownValue = 3;
    this.countdownTimer = 0;
    this.lastFrameTime = performance.now();
    if (this.hooks.onCountdown) this.hooks.onCountdown(this.countdownValue);
    this.animFrameId = requestAnimationFrame(this._loop);

    // Play start sound
    this._audio('start');

    // Emit initial state
    if (this.hooks.onScoreUpdate) {
      this.hooks.onScoreUpdate(0, this.snake.length, 0);
    }
    if (this.hooks.onTimerUpdate && this.timeRemaining > 0) {
      this.hooks.onTimerUpdate(this.timeRemaining);
    }
  }

  /**
   * Main game loop (called via requestAnimationFrame)
   */
  _loop(timestamp) {
    // Calculate delta time (real, not hardcoded)
    let dt = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 0.016;

    // Handle countdown phase
    if (this.state === 'countdown') {
      this.countdownTimer += dt;
      if (this.countdownTimer >= 0.8) { // ~0.8s per count
        this.countdownTimer = 0;
        this.countdownValue--;
        if (this.hooks.onCountdown) this.hooks.onCountdown(this.countdownValue);
        if (this.countdownValue <= 0) {
          this.state = 'playing';
          if (this.hooks.onCountdownEnd) this.hooks.onCountdownEnd();
        }
      }
      this._render(dt);
      this.animFrameId = requestAnimationFrame(this._loop);
      return;
    }

    // Handle death animation phase
    if (this.state === 'dead') {
      if (!this.deathAnimating) {
        if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
        return;
      }
      const elapsed = timestamp - this.deathStartTime;
      const deathDuration = 1200; // 1.2 seconds death animation

      // Continue counting down timer during death animation (fairness)
      if (this.modeConfig.hasTimer && this.timeRemaining > 0) {
        this.timeRemaining -= dt;
        if (this.hooks.onTimerUpdate) {
          this.hooks.onTimerUpdate(Math.max(0, Math.ceil(this.timeRemaining)));
        }
      }

      // Update particles during death
      this.particles.update(dt);
      this.deathOverlayAlpha = Math.max(0, 1 - elapsed / deathDuration);

      // Render death animation
      this._render(dt);

      if (elapsed >= deathDuration) {
        // Animation complete, finalize
        this.deathAnimating = false;
        if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
        this._finalizeDeath();
        return;
      }

      this.animFrameId = requestAnimationFrame(this._loop);
      return;
    }

    if (this.state === 'dead') return;

    // Only accumulate game ticks when playing
    if (this.state === 'playing') {
      this.tickAccumulator += dt * 1000; // Convert to ms

      // Process game ticks
      const effectiveInterval = this.tickInterval * this.foodManager.getSpeedMultiplier();
      while (this.tickAccumulator >= effectiveInterval) {
        this.tickAccumulator -= effectiveInterval;
        this._tick(effectiveInterval / 1000);
        if (this.state === 'dead') break;
      }

      // Update game time
      this.gameTime += dt;

      // Update timer for timed mode
      if (this.modeConfig.hasTimer && this.timeRemaining > 0) {
        this.timeRemaining -= dt;
        if (this.hooks.onTimerUpdate) {
          this.hooks.onTimerUpdate(Math.max(0, Math.ceil(this.timeRemaining)));
        }
        if (this.timeRemaining <= 0) {
          this._die('time up');
        }
      }

      // Update item durations
      const expired = this.foodManager.updateItems(dt * 1000);
      for (const expType of expired) {
        if (this.hooks.onItemExpired) this.hooks.onItemExpired(expType);
      }

      // Death overlay decay
      if (this.deathOverlayAlpha > 0) {
        this.deathOverlayAlpha = Math.max(0, this.deathOverlayAlpha - dt * 2);
      }
    }

    // Always update particles
    this.particles.update(dt);

    // Render (skip during death animation - handled separately)
    if (this.state !== 'dead') {
      this._render(dt);
    }

    // Continue loop (also continue during death animation)
    if (this.state !== 'dead' || this.deathAnimating) {
      this.animFrameId = requestAnimationFrame(this._loop);
    }
  }

  /**
   * Single game logic tick
   */
  _tick(tickDt) {
    if (!this.snake || !this.snake.alive) return;

    // Move snake
    const moveResult = this.snake.move(
      this.renderer.gridCols,
      this.renderer.gridRows,
      this.modeConfig.wallPass
    );

    if (!moveResult.alive) {
      // Check for shield (endless mode or active shield item)
      if (this.shieldCount > 0) {
        this.shieldCount--;
        this.snake.alive = true;
        this.snake.shrink(3);
        this._audio('shieldBreak');
        if (this.hooks.onScoreUpdate) {
          this.hooks.onScoreUpdate(this.score, this.snake.length, this.foodEaten);
        }
        return;
      }
      if (this.foodManager.consumeShield()) {
        this.snake.alive = true;
        this.snake.shrink(3);
        this._audio('shieldBreak');
        this.particles.emit('item', this.snake.head.x * this.renderer.cellSize + this.renderer.cellSize / 2,
          this.snake.head.y * this.renderer.cellSize + this.renderer.cellSize / 2,
          { color: '#7c4dff' });
        if (this.hooks.onScoreUpdate) {
          this.hooks.onScoreUpdate(this.score, this.snake.length, this.foodEaten);
        }
        return;
      }
      // Try respawn
      if (this.respawnsLeft > 0) {
        this.respawnsLeft--;
        this._respawn();
        return;
      }
      // Dead
      this._die('collision');
      return;
    }

    // Check obstacle collision (non-wallpass modes)
    if (this.modeConfig.hasObstacles && !this.modeConfig.wallPass) {
      if (GameModes.checkObstacleCollision(this.snake.head.x, this.snake.head.y, this.obstacles)) {
        if (this.shieldCount > 0) {
          this.shieldCount--;
          this.snake.shrink(3);
          this._audio('shieldBreak');
        } else if (this.foodManager.consumeShield()) {
          this.snake.shrink(3);
          this._audio('shieldBreak');
        } else if (this.respawnsLeft > 0) {
          this.respawnsLeft--;
          this._respawn();
        } else {
          this._die('obstacle');
          return;
        }
      }
    }

    // Check food collision
    if (this.foodManager.checkFoodCollision(this.snake.head.x, this.snake.head.y)) {
      const now = Date.now();
      const combo = this.foodManager.updateCombo(now);
      this.comboCount = combo;
      if (combo > this.maxCombo) this.maxCombo = combo;
      const foodScore = this.foodManager.calculateFoodScore();
      const foodType = this.foodManager.food ? this.foodManager.food.type : 'normal';
      const px = this.snake.head.x * this.renderer.cellSize + this.renderer.cellSize / 2;
      const py = this.snake.head.y * this.renderer.cellSize + this.renderer.cellSize / 2;

      // Handle poison food (instant negative effect, skip normal processing)
      if (foodType === 'poison') {
        this.snake.shrink(3);
        this.particles.emit('eat', px, py, { color: '#8b00ff' });
        this._audio('shieldBreak');
        // Spawn new food and continue (no score/speed/combo update)
        this.foodManager.spawnFood(this.snake, this.obstacles);
        const newItem = this.foodManager.trySpawnItem(this.snake, this.obstacles);
        if (newItem && this.hooks.onItemActivated) {
          this.hooks.onItemActivated('spawned', newItem);
        }
        if (this.hooks.onScoreUpdate) {
          this.hooks.onScoreUpdate(this.score, this.snake.length, this.foodEaten);
        }
        // Skip rest of food processing for poison
        return;
      }

      // Normal and golden food processing
      this.snake.grow(1);
      this.score += foodScore;
      if (foodType === 'golden') {
        this.score += 20; // Extra +20 bonus
        this.particles.emit('eat', px, py, { color: '#ffd700' });
        this.particles.emit('score', px, py - 15, { text: `+${foodScore + 20}⭐`, color: '#ffd700' });
      }
      this.foodEaten++;

      // Update tick speed based on food eaten
      const diff = this.difficultyConfig;
      this.tickInterval = GameModes.getCurrentSpeed(
        diff.initialSpeed,
        diff.speedDecrement,
        diff.minSpeed,
        this.foodEaten,
        this.foodManager.getSpeedMultiplier()
      );

      // Audio
      this._audio('eat', { combo: combo });
      if (combo >= 5) this._audio('combo', { level: Math.min(combo, 10) });

      // Particles
      this.particles.emit('eat', px, py, { color: this.renderer.getThemeColors().foodColor });

      // Score popup (non-golden)
      if (foodScore > 10 && foodType !== 'golden') {
        this.particles.emit('score', px, py - 15,
          { text: `+${foodScore}`, color: combo > 3 ? '#ffd700' : '#ffffff' });
      }

      // Update speed gauge
      this._updateSpeedLevel();

      // Obstacle mode: level progression
      if (this.modeConfig.hasObstacles) {
        this.foodSinceLastObstacle++;
        if (this.foodSinceLastObstacle >= 8) {
          this.foodSinceLastObstacle = 0;
          this.obstacleLevel++;
          const newObs = GameModes.generateObstacles(
            3, this.snake, this.renderer.gridCols, this.renderer.gridRows, this.obstacleLevel
          );
          this.obstacles = [...this.obstacles, ...newObs].slice(0, 50);
          // Reset obstacle cache in renderer so it redraws
          if (this.renderer._lastObstacleHash !== undefined) {
            this.renderer._lastObstacleHash = '';
          }
          if (this.hooks.onObstacleLevelUp) {
            this.hooks.onObstacleLevelUp(this.obstacleLevel);
          }
        }
      }

      // Spawn new food
      this.foodManager.spawnFood(this.snake, this.obstacles);

      // Try spawn item
      const newItem = this.foodManager.trySpawnItem(this.snake, this.obstacles);
      if (newItem && this.hooks.onItemActivated) {
        // Just notify UI that item spawned (not activated)
        this.hooks.onItemActivated('spawned', newItem);
      }

      // Update UI
      if (this.hooks.onScoreUpdate) {
        this.hooks.onScoreUpdate(this.score, this.snake.length, this.foodEaten);
      }
    }

    // Check item collision
    const collectedItem = this.foodManager.checkItemCollision(this.snake.head.x, this.snake.head.y);
    if (collectedItem) {
      this._audio('item');
      const px = this.snake.head.x * this.renderer.cellSize + this.renderer.cellSize / 2;
      const py = this.snake.head.y * this.renderer.cellSize + this.renderer.cellSize / 2;
      this.particles.emit('item', px, py, { color: collectedItem.color });

      // Track items collected for stats
      const stats = StorageManager.getStats();
      stats.itemsCollected = (stats.itemsCollected || 0) + 1;
      StorageManager.saveStats(stats);

      // Handle instant effects
      if (collectedItem.type === 'shrink') {
        this.snake.shrink(3);
      }
      if (collectedItem.type === 'shield') {
        this.shieldCount++;
      }

      // Notify UI
      if (this.hooks.onItemActivated) {
        this.hooks.onItemActivated(collectedItem.type, collectedItem);
      }
    }

    // Magnet effect - pull food toward head
    if (this.foodManager.hasItem('magnet') && this.foodManager.food) {
      const head = this.snake.head;
      const food = this.foodManager.food;
      const dx = food.x - head.x;
      const dy = food.y - head.y;
      const dist = Math.abs(dx) + Math.abs(dy);

      if (dist <= 5 && dist > 0) {
        // Move food one step toward head
        const newX = food.x - Math.sign(dx);
        const newY = food.y - Math.sign(dy);
        // Only move if not occupied
        if (!this.snake.occupies(newX, newY, false) &&
            !GameModes.checkObstacleCollision(newX, newY, this.obstacles)) {
          food.x = newX;
          food.y = newY;
        }
      }
    }
  }

  /**
   * Update speed level gauge (1-5)
   */
  _updateSpeedLevel() {
    const diff = this.difficultyConfig;
    const range = diff.initialSpeed - diff.minSpeed;
    const current = this.tickInterval - diff.minSpeed;
    const ratio = range > 0 ? 1 - (current / range) : 0;
    const prevLevel = this.speedLevel;
    this.speedLevel = Math.min(this.maxSpeedLevel, 1 + Math.floor(ratio * this.maxSpeedLevel));
    if (this.speedLevel > prevLevel) {
      this._audio('speedUp', { level: this.speedLevel });
    }
  }

  /**
   * Handle player death - cinematic sequence
   */
  _die(reason) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.snake.alive = false;
    this.deathAnimating = true;
    this.deathStartTime = performance.now();
    this.deathReason = reason;

    // Death audio
    this._audio('death');

    // Death particles at head and along body
    if (this.snake && this.snake.body.length > 0) {
      const cs = this.renderer.cellSize;
      const color = this.skinColors ? (this.skinColors.body || '#6c5ce7') : '#6c5ce7';
      // Emit particles at each body segment for dramatic effect
      this._deathTimers = [];
      for (let i = 0; i < this.snake.body.length; i++) {
        const seg = this.snake.body[i];
        const px = seg.x * cs + cs / 2;
        const py = seg.y * cs + cs / 2;
        const tid = setTimeout(() => {
          this.particles.emit('death', px, py, { color });
        }, i * 25); // Staggered: each segment explodes 25ms after the previous
        this._deathTimers.push(tid);
      }
      // Big explosion at head immediately
      const hx = this.snake.head.x * cs + cs / 2;
      const hy = this.snake.head.y * cs + cs / 2;
      this.particles.emit('death', hx, hy, { color });
    }

    this.deathOverlayAlpha = 1;

    // Death animation will continue in _loop, then _finalizeDeath is called
  }

  /**
   * Called after death animation completes
   */
  _finalizeDeath() {
    // Clear any pending death animation timers
    this._clearDeathTimers();
    const reason = this.deathReason || 'collision';

    // Calculate coins earned
    const coinsEarned = Math.floor(this.score * 0.1);
    StorageManager.addCoins(coinsEarned);

    // Save local score
    StorageManager.addLocalScore({
      mode: this.mode, score: this.score,
      length: this.snake ? this.snake.length : 0,
      duration: Math.round(this.gameTime), foodEaten: this.foodEaten
    });

    // Update stats
    const stats = StorageManager.getStats();
    stats.totalGames++; stats.totalPlayTime += Math.round(this.gameTime);
    stats.totalScore += this.score; stats.totalFoodEaten += this.foodEaten;
    stats.totalPlayTime = Math.round(stats.totalPlayTime);
    if (this.score > stats.highestScore) stats.highestScore = this.score;
    if (this.snake && this.snake.length > stats.highestLength) stats.highestLength = this.snake.length;
    if (this.score > (stats.bestScores[this.mode] || 0)) stats.bestScores[this.mode] = this.score;
    if (!stats.modesPlayed.includes(this.mode)) stats.modesPlayed.push(this.mode);
    StorageManager.saveStats(stats);

    // Server submit
    if (ApiClient.isAuthenticated()) {
      ApiClient.submitScore({
        mode: this.mode, score: this.score,
        length: this.snake ? this.snake.length : 0,
        duration: Math.round(this.gameTime), foodEaten: this.foodEaten
      }).catch(() => {});
      ApiClient.syncData({ stats, coins: coinsEarned }).catch(() => {});
    }

    const achievementsUnlocked = this._checkAchievements(stats);

    // Notify UI
    if (this.hooks.onGameOver) {
      this.hooks.onGameOver({
        mode: this.mode, score: this.score,
        length: this.snake ? this.snake.length : 0,
        duration: Math.round(this.gameTime), foodEaten: this.foodEaten,
        maxCombo: this.maxCombo,
        coinsEarned, reason,
        isNewHighScore: this.score >= stats.highestScore,
        highestScore: stats.highestScore,
        achievementsUnlocked
      });
    }

    // Cleanup
    if (this.inputManager) { this.inputManager.destroy(); this.inputManager = null; }
  }

  /**
   * Respawn after death (timed mode)
   */
  _respawn() {
    if (this.hooks.onRespawn) {
      this.hooks.onRespawn();
    }

    // Reset snake position but keep score
    const startX = Math.floor(this.renderer.gridCols / 2);
    const startY = Math.floor(this.renderer.gridRows / 2);
    this.snake.reset(startX, startY, CONFIG.SNAKE_INITIAL_LENGTH);

    // Clear active items
    this.foodManager.activeItems = [];
    this.shieldCount = this.modeConfig.initialShields || 0;

    // Reset speed
    const diff = this.difficultyConfig;
    this.tickInterval = diff.initialSpeed;
    this.foodEaten = 0;
    this.comboCount = 0;

    // Re-spawn food
    this.foodManager.food = null;
    this.foodManager.item = null;
    this.foodManager.spawnFood(this.snake, this.obstacles);
  }

  /**
   * Play audio safely via AudioManager singleton
   */
  _audio(type, opts) {
    try {
      const am = AudioManager.instance;
      if (!am || !am.initialized) return;
      switch (type) {
        case 'eat': am.playEat(opts?.combo || 0); break;
        case 'item': am.playItem(); break;
        case 'death': am.playDeath(); break;
        case 'combo': am.playCombo(opts?.level || 1); break;
        case 'start': am.playStart(); break;
        case 'pause': am.playPause(); break;
        case 'resume': am.playResume(); break;
        case 'shieldBreak': am.playShieldBreak(); break;
        case 'speedUp': am.playSpeedUp(opts?.level || 1); break;
        case 'achievement': am.playAchievement(); break;
      }
    } catch(e) { /* Audio unavailable - non-critical */ }
  }

  /**
   * Handle direction input from InputManager
   */
  _handleDirection(dx, dy) {
    if (this.state !== 'playing') return;
    if (!this.snake || !this.snake.alive) return;
    this.snake.setDirection(dx, dy);
  }

  /**
   * Toggle pause state
   */
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this._audio('pause');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.lastFrameTime = performance.now();
      this._audio('resume');
    }
    return this.state;
  }

  /**
   * Resume from pause
   */
  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.lastFrameTime = performance.now();
    }
  }

  /**
   * End game early (quit)
   */
  _clearDeathTimers() {
    for (const tid of this._deathTimers) clearTimeout(tid);
    this._deathTimers = [];
  }

  quit() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.state = 'dead';
    this._clearDeathTimers();
    if (this.inputManager) {
      this.inputManager.destroy();
      this.inputManager = null;
    }
    // Renderer is destroyed by GameScreen when creating a new one
  }

  /**
   * Build render state object and render
   */
  _render(dt) {
    if (!dt) dt = 0.016;
    const renderState = {
      snake: this.snake,
      food: this.foodManager.food,
      item: this.foodManager.item,
      obstacles: this.obstacles,
      particles: this.particles.particles,
      shakeOffset: this.particles.getShakeOffset(),
      snakeHead: this.snake ? this.snake.head : null,
      skinColors: this.skinColors,
      shieldActive: this.shieldCount > 0 || this.foodManager.hasItem('shield'),
      magnetActive: this.foodManager.hasItem('magnet'),
      deathOverlay: this.deathOverlayAlpha,
      // Visual feedback states
      speedLevel: this.speedLevel,
      doubleScoreActive: this.foodManager.hasItem('doubleScore'),
      slowDownActive: this.foodManager.hasItem('slowDown'),
      obstacleLevel: this.obstacleLevel
    };

    this.renderer.render(renderState, dt || 0.016);

    // Update HUD speed indicator via hooks
    if (this.hooks.onSpeedUpdate) {
      this.hooks.onSpeedUpdate(this.speedLevel);
    }
    if (this.hooks.onObstacleLevelUpdate && this.modeConfig.hasObstacles) {
      this.hooks.onObstacleLevelUpdate(this.obstacleLevel);
    }
  }

  /**
   * Check and unlock achievements based on current stats
   */
  _checkAchievements(stats) {
    const achData = StorageManager.getAchievementData();
    const unlocked = new Set(achData.unlocked.map(a => a.id || a));
    const newlyUnlocked = [];

    const check = (id) => {
      if (!unlocked.has(id)) {
        newlyUnlocked.push(id);
        unlocked.add(id);
      }
    };

    // Score-based
    if (this.score >= 100) check('score_100');
    if (this.score >= 500) check('score_500');
    if (this.score >= 1000) check('score_1000');
    if (this.score >= 2000) check('score_2000');

    // Length-based
    if (this.snake && this.snake.length >= 20) check('length_20');
    if (this.snake && this.snake.length >= 50) check('length_50');

    // Total games
    if (stats.totalGames >= 1) check('first_game');
    if (stats.totalGames >= 10) check('total_10_games');
    if (stats.totalGames >= 100) check('total_100_games');

    // Play time
    if (stats.totalPlayTime >= 3600) check('play_1h');
    if (stats.totalPlayTime >= 36000) check('play_10h');

    // Food eaten
    if (stats.totalFoodEaten >= 100) check('food_100');
    if (stats.totalFoodEaten >= 1000) check('food_1000');

    // Mode-specific
    if (stats.modesPlayed && stats.modesPlayed.length >= 5) check('all_modes');
    if (this.mode === 'timed' && this.score >= 500) check('timed_500');
    if (this.mode === 'obstacle' && this.score >= 300) check('obstacle_300');
    if (this.mode === 'wallpass' && this.score >= 1000) check('wallpass_1000');

    // Combo
    if (this.comboCount >= 5 || this.foodManager.comboCount >= 5) check('combo_5');
    if (this.comboCount >= 10 || this.foodManager.comboCount >= 10) check('combo_10');

    // Item collection
    if (stats.itemsCollected >= 20) check('item_collector');

    // Coins
    const coins = StorageManager.getCoins();
    if (coins >= 1000) check('coin_1000');

    // Skin collection
    const skinData = StorageManager.getSkinData();
    if (skinData.unlocked && skinData.unlocked.length >= 5) check('skin_collector');

    // Perfect run: completed game without dying and without using shield
    if (!this.deathReason || this.deathReason === 'time up') {
      // Player completed the game (time up or reached end)
      const initialShields = this.modeConfig.initialShields || 0;
      const shieldsUsed = initialShields - this.shieldCount;
      if (shieldsUsed <= 0 && !this.foodManager.hasItem('shield')) check('perfect_run');
    }

    // Endless shield collector: collected 5+ shields in endless mode
    if (this.mode === 'endless') {
      const endlessShields = (stats.endlessShieldsCollected || 0) + (this.shieldCount > 0 ? this.shieldCount : 0);
      if (endlessShields >= 5) check('endless_shield_5');
      stats.endlessShieldsCollected = endlessShields;
    }

    // Zero death streak: completed classic mode without death
    if (this.mode === 'classic' && this.deathReason !== 'collision' && this.deathReason !== 'obstacle') {
      stats.classicZeroDeathStreak = (stats.classicZeroDeathStreak || 0) + 1;
      if (stats.classicZeroDeathStreak >= 5) check('zero_death_5');
    } else if (this.mode === 'classic') {
      stats.classicZeroDeathStreak = 0;
    }

    // If any newly unlocked
    if (newlyUnlocked.length > 0) {
      // Play achievement sound
      this._audio('achievement');

      // Save achievements
      achData.unlocked = [...unlocked].map(id => ({ id, unlockedAt: new Date().toISOString() }));
      StorageManager.saveAchievementData(achData);

      // Award coins for achievements
      let totalReward = 0;
      for (const achId of newlyUnlocked) {
        const achDef = CONFIG.ACHIEVEMENTS.find(a => a.id === achId);
        if (achDef) totalReward += achDef.reward;
      }
      if (totalReward > 0) {
        StorageManager.addCoins(totalReward);
      }

      // Sync to server if authenticated
      if (ApiClient.isAuthenticated()) {
        ApiClient.updateProfile({
          unlockedAchievements: achData.unlocked
        }).catch(() => {});
      }
    }

    return newlyUnlocked;
  }
}
