/**
 * GameModes - Mode-specific configurations, rules, and obstacle generation
 *
 * Five modes:
 * - classic:   No time limit, no obstacles, death = game over
 * - timed:     3/5 minute limit, score competition, 1 respawn
 * - obstacle:  Random obstacles, difficulty scales with level
 * - wallpass:  Wrap around walls, only self-collision kills
 * - endless:   1 shield, collision consumes shield + shrinks, shields replenishable
 */
class GameModes {
  /**
   * Get mode configuration
   * @param {string} mode - Mode identifier
   * @param {object} options - Mode-specific options (e.g., { timeLimit: 300 })
   * @returns {object} Mode config object
   */
  static getConfig(mode, options = {}) {
    const base = {
      mode,
      hasTimer: false,
      timeLimit: 0,
      wallPass: false,
      hasObstacles: false,
      obstacleCount: 0,
      hasShield: false,
      initialShields: 0,
      canRespawn: false,
      respawnsLeft: 0,
      description: ''
    };

    switch (mode) {
      case 'classic':
        return {
          ...base,
          description: '经典模式 - 冲击最高分'
        };

      case 'timed':
        return {
          ...base,
          hasTimer: true,
          timeLimit: options.timeLimit || CONFIG.MODE_TIMED_DURATION,
          canRespawn: true,
          respawnsLeft: 1,
          description: '限时模式 - 争分夺秒'
        };

      case 'obstacle':
        return {
          ...base,
          hasObstacles: true,
          obstacleCount: CONFIG.MODE_OBSTACLE_COUNT,
          description: '障碍模式 - 小心障碍物'
        };

      case 'wallpass':
        return {
          ...base,
          wallPass: true,
          description: '穿墙模式 - 穿越边界'
        };

      case 'endless':
        return {
          ...base,
          hasShield: true,
          initialShields: CONFIG.MODE_ENDLESS_INITIAL_SHIELDS,
          description: '无尽模式 - 护盾保护'
        };

      default:
        return base;
    }
  }

  /**
   * Generate obstacle positions for a given level
   * @param {number} count - Number of obstacles
   * @param {Snake} snake - Snake instance (to avoid placing near snake)
   * @param {number} gridCols
   * @param {number} gridRows
   * @param {number} level - Current level (affects difficulty)
   * @returns {Array} Array of {x, y} positions
   */
  static generateObstacles(count, snake, gridCols, gridRows, level = 1) {
    const obstacles = [];
    const occupied = new Set();

    // Don't place obstacles on the snake
    for (const seg of snake.body) {
      occupied.add(`${seg.x},${seg.y}`);
    }

    // Don't place obstacles in the center area (5x5 safe zone for start)
    const centerX = Math.floor(gridCols / 2);
    const centerY = Math.floor(gridRows / 2);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        occupied.add(`${centerX + dx},${centerY + dy}`);
      }
    }

    // Generate obstacles with some clustering for higher levels
    const actualCount = Math.min(count + Math.floor(level / 3) * 2, 40);
    let attempts = 0;
    const maxAttempts = actualCount * 20;

    // For higher levels, try to create small clusters
    if (level >= 3) {
      const clusters = Math.floor(level / 2);
      for (let c = 0; c < clusters && obstacles.length < actualCount; c++) {
        const cx = 2 + Math.floor(Math.random() * (gridCols - 4));
        const cy = 2 + Math.floor(Math.random() * (gridRows - 4));
        const clusterSize = 2 + Math.floor(Math.random() * 3);

        for (let i = 0; i < clusterSize && obstacles.length < actualCount; i++) {
          const ox = cx + Math.floor(Math.random() * 3) - 1;
          const oy = cy + Math.floor(Math.random() * 3) - 1;
          const key = `${ox},${oy}`;
          if (ox >= 0 && ox < gridCols && oy >= 0 && oy < gridRows && !occupied.has(key)) {
            obstacles.push({ x: ox, y: oy });
            occupied.add(key);
          }
        }
      }
    }

    // Fill remaining obstacles randomly
    while (obstacles.length < actualCount && attempts < maxAttempts) {
      const x = Math.floor(Math.random() * gridCols);
      const y = Math.floor(Math.random() * gridRows);
      const key = `${x},${y}`;

      if (!occupied.has(key)) {
        obstacles.push({ x, y });
        occupied.add(key);
      }
      attempts++;
    }

    return obstacles;
  }

  /**
   * Check if a position collides with any obstacle
   */
  static checkObstacleCollision(x, y, obstacles) {
    return obstacles.some(o => o.x === x && o.y === y);
  }

  /**
   * Get the speed for the current game tick
   * @param {number} baseSpeed - Initial speed in ms
   * @param {number} speedDecrement - ms reduction per food
   * @param {number} minSpeed - Fastest allowed
   * @param {number} foodEaten - Total food eaten so far
   * @param {number} speedMultiplier - From items (e.g., 0.7 for slow)
   */
  static getCurrentSpeed(baseSpeed, speedDecrement, minSpeed, foodEaten, speedMultiplier = 1) {
    const rawSpeed = Math.max(minSpeed, baseSpeed - foodEaten * speedDecrement);
    return rawSpeed * speedMultiplier;
  }
}
