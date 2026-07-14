/**
 * Snake - Manages snake body, movement, growth, and collision detection
 *
 * The snake body is stored as an array of {x, y} positions.
 * Index 0 = head, last index = tail.
 * Movement is controlled via a direction vector that updates on each tick.
 */
'use strict';

class Snake {
  /**
   * @param {number} startX - Initial head X grid position
   * @param {number} startY - Initial head Y grid position
   * @param {number} initialLength - Starting body length (default 3)
   */
  constructor(startX, startY, initialLength = 3) {
    this.body = [];
    this.direction = { x: 1, y: 0 };      // Current movement direction
    this.nextDirection = { x: 1, y: 0 };   // Queued direction (prevents double-reverse)
    this.growing = 0;                       // Segments to add on next tick
    this.alive = true;

    // Build initial body (head at startX, body trailing to the left)
    for (let i = 0; i < initialLength; i++) {
      this.body.push({ x: startX - i, y: startY });
    }

    // Track the last tail position for smooth rendering
    this.prevTail = { ...this.body[this.body.length - 1] };
  }

  /**
   * Get the head position
   */
  get head() {
    return this.body[0];
  }

  /**
   * Get snake length
   */
  get length() {
    return this.body.length;
  }

  /**
   * Queue a new direction. Prevents 180-degree reversal.
   * @param {number} x - X component (-1, 0, 1)
   * @param {number} y - Y component (-1, 0, 1)
   */
  setDirection(x, y) {
    // Prevent reversing into yourself
    if (this.direction.x === -x && this.direction.y === -y && this.body.length > 1) {
      return;
    }
    // Prevent no-direction
    if (x === 0 && y === 0) return;
    // Must be axis-aligned
    if (Math.abs(x) + Math.abs(y) !== 1) return;

    this.nextDirection = { x, y };
  }

  /**
   * Move the snake one step. Called on each game tick.
   * @param {number} gridCols - Grid width for wall collision
   * @param {number} gridRows - Grid height for wall collision
   * @param {boolean} wallPass - If true, wrap around walls instead of dying
   * @returns {object} { alive, wrappedX, wrappedY }
   */
  move(gridCols, gridRows, wallPass = false) {
    if (!this.alive) return { alive: false };

    // Apply queued direction
    this.direction = { ...this.nextDirection };

    // Calculate new head position
    let newX = this.head.x + this.direction.x;
    let newY = this.head.y + this.direction.y;
    let wrappedX = false;
    let wrappedY = false;

    // Wall collision or wrapping
    if (wallPass) {
      if (newX < 0) { newX = gridCols - 1; wrappedX = true; }
      if (newX >= gridCols) { newX = 0; wrappedX = true; }
      if (newY < 0) { newY = gridRows - 1; wrappedY = true; }
      if (newY >= gridRows) { newY = 0; wrappedY = true; }
    } else {
      if (newX < 0 || newX >= gridCols || newY < 0 || newY >= gridRows) {
        this.alive = false;
        return { alive: false };
      }
    }

    // Self collision (check against all body except the tail which will move)
    // Actually check against current body; if not growing, tail will be removed
    const checkLength = this.growing > 0 ? this.body.length : this.body.length - 1;
    for (let i = 0; i < checkLength; i++) {
      if (this.body[i].x === newX && this.body[i].y === newY) {
        this.alive = false;
        return { alive: false };
      }
    }

    // Save previous tail for interpolation
    this.prevTail = { ...this.body[this.body.length - 1] };

    // Add new head
    this.body.unshift({ x: newX, y: newY });

    // Remove tail unless growing
    if (this.growing > 0) {
      this.growing--;
    } else {
      this.body.pop();
    }

    return { alive: true, wrappedX, wrappedY };
  }

  /**
   * Grow the snake by N segments
   * @param {number} amount - Segments to add (default 1)
   */
  grow(amount = 1) {
    this.growing += amount;
  }

  /**
   * Shrink the snake by N segments (minimum length of 2)
   * @param {number} amount - Segments to remove (default 3)
   */
  shrink(amount = 3) {
    const remove = Math.min(amount, this.body.length - 2);
    if (remove > 0) {
      this.body.splice(this.body.length - remove, remove);
    }
  }

  /**
   * Check if a grid position overlaps the snake body
   * @param {number} x
   * @param {number} y
   * @param {boolean} excludeHead - Don't check head position
   * @returns {boolean}
   */
  occupies(x, y, excludeHead = true) {
    const start = excludeHead ? 1 : 0;
    for (let i = start; i < this.body.length; i++) {
      if (this.body[i].x === x && this.body[i].y === y) return true;
    }
    return false;
  }

  /**
   * Get the movement direction angle in radians (for rendering)
   */
  getDirectionAngle() {
    return Math.atan2(this.direction.y, this.direction.x);
  }

  /**
   * Reset snake to initial state
   */
  reset(startX, startY, initialLength = 3) {
    this.body = [];
    for (let i = 0; i < initialLength; i++) {
      this.body.push({ x: startX - i, y: startY });
    }
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.growing = 0;
    this.alive = true;
    this.prevTail = { ...this.body[this.body.length - 1] };
  }
}
