/**
 * FoodManager - Handles food & item spawning, placement, and collection logic
 *
 * Manages:
 * - Regular food placement (avoiding snake body & obstacles)
 * - Special item spawning with weighted randomization
 * - Active item effects and durations
 * - Combo system for consecutive food pickups
 * - Magnet effect for auto-collecting nearby food
 */
class FoodManager {
  /**
   * @param {number} gridCols
   * @param {number} gridRows
   */
  constructor(gridCols, gridRows) {
    this.gridCols = gridCols;
    this.gridRows = gridRows;
    this.food = null;            // Current food position {x, y}
    this.item = null;            // Current item {x, y, type, ...}
    this.activeItems = [];       // [{ type, remaining, startedAt }]
    this.comboCount = 0;         // Consecutive food pickups
    this.lastFoodTime = 0;       // Timestamp of last food pickup
  }

  /**
   * Spawn food at a random empty cell
   * @param {Snake} snake - Snake instance for collision avoidance
   * @param {Array} obstacles - Array of obstacle positions
   */
  spawnFood(snake, obstacles = []) {
    const emptyCells = this.getEmptyCells(snake, obstacles);
    if (emptyCells.length === 0) return null;

    const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    this.food = { x: cell.x, y: cell.y };
    return this.food;
  }

  /**
   * Try to spawn a special item (called after food is eaten)
   * @param {Snake} snake
   * @param {Array} obstacles
   */
  trySpawnItem(snake, obstacles = []) {
    // Remove expired item if present
    if (this.item) return null;

    if (Math.random() < CONFIG.ITEM_SPAWN_CHANCE) {
      const emptyCells = this.getEmptyCells(snake, obstacles, true);
      if (emptyCells.length === 0) return null;

      const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      const type = this.weightedRandomItem();

      this.item = {
        x: cell.x,
        y: cell.y,
        type: type.type,
        label: type.label,
        color: type.color,
        spawnedAt: Date.now()
      };
      return this.item;
    }
    return null;
  }

  /**
   * Weighted random selection from ITEM_TYPES
   */
  weightedRandomItem() {
    const totalWeight = CONFIG.ITEM_TYPES.reduce((s, t) => s + t.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const itemType of CONFIG.ITEM_TYPES) {
      roll -= itemType.weight;
      if (roll <= 0) return itemType;
    }
    return CONFIG.ITEM_TYPES[0];
  }

  /**
   * Get all empty cells on the grid
   */
  getEmptyCells(snake, obstacles = [], excludeFood = false) {
    const occupied = new Set();

    // Mark snake body
    for (const seg of snake.body) {
      occupied.add(`${seg.x},${seg.y}`);
    }

    // Mark obstacles
    for (const obs of obstacles) {
      occupied.add(`${obs.x},${obs.y}`);
    }

    // Mark current food
    if (!excludeFood && this.food) {
      occupied.add(`${this.food.x},${this.food.y}`);
    }

    // Mark current item
    if (this.item) {
      occupied.add(`${this.item.x},${this.item.y}`);
    }

    const empty = [];
    for (let x = 0; x < this.gridCols; x++) {
      for (let y = 0; y < this.gridRows; y++) {
        if (!occupied.has(`${x},${y}`)) {
          empty.push({ x, y });
        }
      }
    }
    return empty;
  }

  /**
   * Check if snake head is on food
   */
  checkFoodCollision(headX, headY) {
    if (this.food && this.food.x === headX && this.food.y === headY) {
      this.food = null;
      return true;
    }
    return false;
  }

  /**
   * Check if snake head is on an item
   */
  checkItemCollision(headX, headY) {
    if (this.item && this.item.x === headX && this.item.y === headY) {
      const collected = { ...this.item };
      this.item = null;

      // Activate the item effect
      this.activateItem(collected.type);
      return collected;
    }
    return null;
  }

  /**
   * Activate an item effect
   */
  activateItem(type) {
    const duration = CONFIG.ITEM_DURATIONS[type] || 0;

    // For instant effects, don't add to active items
    if (type === 'shrink') {
      return; // Handled by GameEngine
    }

    // Remove existing effect of same type
    this.activeItems = this.activeItems.filter(i => i.type !== type);

    this.activeItems.push({
      type,
      remaining: duration,
      startedAt: Date.now(),
      duration
    });
  }

  /**
   * Update active item durations. Call each frame.
   * @param {number} deltaTime - ms since last frame
   * @returns {Array} Expired item types
   */
  updateItems(deltaTime) {
    const expired = [];

    for (let i = this.activeItems.length - 1; i >= 0; i--) {
      const item = this.activeItems[i];
      if (item.duration !== Infinity) {
        item.remaining -= deltaTime;
        if (item.remaining <= 0) {
          expired.push(item.type);
          this.activeItems.splice(i, 1);
        }
      }
    }

    return expired;
  }

  /**
   * Check if a specific item type is active
   */
  hasItem(type) {
    return this.activeItems.some(i => i.type === type);
  }

  /**
   * Consume a shield (removes one shield from active items)
   */
  consumeShield() {
    const idx = this.activeItems.findIndex(i => i.type === 'shield');
    if (idx >= 0) {
      this.activeItems.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all active shield count
   */
  getShieldCount() {
    return this.activeItems.filter(i => i.type === 'shield').length;
  }

  /**
   * Get the score multiplier based on active items
   */
  getScoreMultiplier() {
    return this.hasItem('doubleScore') ? 2 : 1;
  }

  /**
   * Get speed multiplier based on active items
   */
  getSpeedMultiplier() {
    return this.hasItem('slowDown') ? 0.7 : 1;
  }

  /**
   * Update combo counter on food pickup
   * @param {number} now - Current timestamp
   * @returns {number} Current combo level (0 = no combo)
   */
  updateCombo(now) {
    if (now - this.lastFoodTime < CONFIG.FOOD_COMBO_WINDOW) {
      this.comboCount++;
    } else {
      this.comboCount = 1;
    }
    this.lastFoodTime = now;
    return this.comboCount;
  }

  /**
   * Calculate score for eating food with combo and multiplier
   */
  calculateFoodScore() {
    const baseScore = CONFIG.FOOD_SCORE;
    const multiplier = this.getScoreMultiplier();
    const comboBonus = Math.floor((this.comboCount - 1) * CONFIG.FOOD_COMBO_MULTIPLIER * baseScore);
    return (baseScore + comboBonus) * multiplier;
  }

  /**
   * Find nearest food for magnet effect
   * @param {number} headX
   * @param {number} headY
   * @param {number} range - Grid cells range
   * @returns {object|null} Nearest food position or null
   */
  getNearestFood(headX, headY, range = 4) {
    if (!this.food) return null;

    const dx = this.food.x - headX;
    const dy = this.food.y - headY;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (dist <= range) {
      return { x: this.food.x, y: this.food.y, dx: Math.sign(dx), dy: Math.sign(dy) };
    }
    return null;
  }

  /**
   * Reset all state
   */
  reset() {
    this.food = null;
    this.item = null;
    this.activeItems = [];
    this.comboCount = 0;
    this.lastFoodTime = 0;
  }
}
