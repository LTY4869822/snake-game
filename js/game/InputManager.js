/**
 * InputManager - Unified input handling for keyboard, touch, and swipe
 *
 * Supports:
 * - Keyboard: WASD and Arrow keys (configurable) + R/Space/Esc shortcuts
 * - Touch: Virtual D-pad buttons
 * - Swipe: Touch swipe gestures on the canvas
 * - Direction queue for input buffering (prevents lost fast inputs)
 * - All inputs normalized to direction vectors {x, y}
 */
'use strict';

class InputManager {
  /**
   * @param {object} options - Configuration
   * @param {string} options.controlScheme - 'wasd' or 'arrows'
   * @param {string} options.mobileControl - 'swipe' or 'dpad'
   * @param {function} options.onDirection - Callback(dx, dy) when direction changes
   * @param {function} options.onPause - Callback() when pause requested
   * @param {function} [options.onRestart] - Callback() when restart requested
   * @param {function} [options.onQuit] - Callback() when quit requested
   * @param {HTMLElement} options.canvasElement - Canvas for swipe detection
   */
  constructor(options = {}) {
    this.controlScheme = options.controlScheme || 'wasd';
    this.mobileControl = options.mobileControl || 'swipe';
    this.onDirection = options.onDirection || (() => {});
    this.onPause = options.onPause || (() => {});
    this.onRestart = options.onRestart || null;
    this.onQuit = options.onQuit || null;
    this.canvasElement = options.canvasElement || null;

    // Swipe tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.swipeThreshold = 30;     // Minimum px for swipe
    this.swipeTimeThreshold = 500; // Maximum ms for swipe

    // Direction queue to buffer rapid inputs
    this.directionQueue = [];
    this.maxQueueSize = 3;

    // Bound handlers for cleanup (all named, no anonymous leaks)
    this._keyHandler = this._handleKey.bind(this);
    this._touchStartHandler = this._handleTouchStart.bind(this);
    this._touchEndHandler = this._handleTouchEnd.bind(this);
    this._dpadHandler = this._handleDpad.bind(this);
    this._dpadTouchHandler = this._handleDpadTouch.bind(this);
    this._resizeHandler = this._updateMobileControls.bind(this);

    // Track D-pad buttons for cleanup
    this._dpadButtons = [];

    this._setup();
  }

  /**
   * Set up all event listeners
   */
  _setup() {
    // Keyboard
    window.addEventListener('keydown', this._keyHandler);

    // Touch swipe on canvas
    if (this.canvasElement) {
      this.canvasElement.addEventListener('touchstart', this._touchStartHandler, { passive: false });
      this.canvasElement.addEventListener('touchend', this._touchEndHandler, { passive: false });
      this.canvasElement.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    }

    // Virtual D-pad buttons - use named handlers for clean removal
    this._dpadButtons = document.querySelectorAll('.dpad-btn');
    this._dpadButtons.forEach(btn => {
      btn.addEventListener('pointerdown', this._dpadHandler);
      btn.addEventListener('touchstart', this._dpadTouchHandler);
    });

    // Detect if device has touch capability
    this._updateMobileControls();
    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * Enqueue a direction for processing (prevents fast input loss)
   */
  enqueueDirection(dx, dy) {
    if (this.directionQueue.length >= this.maxQueueSize) return;
    // Prevent duplicate consecutive directions
    const last = this.directionQueue[this.directionQueue.length - 1];
    if (last && last.dx === dx && last.dy === dy) return;
    this.directionQueue.push({ dx, dy });
  }

  /**
   * Dequeue next direction; returns null if queue is empty
   */
  dequeueDirection() {
    return this.directionQueue.shift() || null;
  }

  /**
   * Clear the direction queue
   */
  clearQueue() {
    this.directionQueue.length = 0;
  }

  /**
   * Show/hide mobile controls based on device
   */
  _updateMobileControls() {
    const mobileControls = document.getElementById('mobile-controls');
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (mobileControls) {
      if (hasTouch && this.mobileControl === 'dpad') {
        mobileControls.style.display = 'flex';
      } else if (hasTouch && this.mobileControl === 'swipe') {
        mobileControls.style.display = 'none';
      } else {
        mobileControls.style.display = 'none';
      }
    }
  }

  /**
   * Set control scheme at runtime
   */
  setControlScheme(scheme) {
    this.controlScheme = scheme;
  }

  /**
   * Set mobile control type
   */
  setMobileControl(type) {
    this.mobileControl = type;
    this._updateMobileControls();
  }

  /**
   * Handle keyboard input
   */
  _handleKey(e) {
    let dx = 0, dy = 0;

    // Global shortcuts
    switch (e.key) {
      case 'Escape':
        if (this.onQuit) { this.onQuit(); e.preventDefault(); return; }
        this.onPause();
        e.preventDefault();
        return;
      case 'p':
      case ' ':
        this.onPause();
        e.preventDefault();
        return;
      case 'r':
      case 'R':
        if (this.onRestart) { this.onRestart(); e.preventDefault(); return; }
        break;
    }

    // WASD
    if (this.controlScheme === 'wasd') {
      switch (e.key.toLowerCase()) {
        case 'w': dy = -1; break;
        case 's': dy = 1; break;
        case 'a': dx = -1; break;
        case 'd': dx = 1; break;
      }
    }

    // Arrow keys (always work as fallback)
    switch (e.key) {
      case 'ArrowUp': dy = -1; break;
      case 'ArrowDown': dy = 1; break;
      case 'ArrowLeft': dx = -1; break;
      case 'ArrowRight': dx = 1; break;
    }

    if (dx !== 0 || dy !== 0) {
      e.preventDefault();
      // Use direction queue to buffer fast inputs
      this.enqueueDirection(dx, dy);
      this.onDirection(dx, dy);
    }
  }

  /**
   * Handle touch start for swipe detection
   */
  _handleTouchStart(e) {
    if (this.mobileControl !== 'swipe') return;
    e.preventDefault();

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
  }

  /**
   * Handle touch end - calculate swipe direction
   */
  _handleTouchEnd(e) {
    if (this.mobileControl !== 'swipe') return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const dt = Date.now() - this.touchStartTime;

    // Check minimum distance and time
    if (Math.abs(dx) < this.swipeThreshold && Math.abs(dy) < this.swipeThreshold) return;
    if (dt > this.swipeTimeThreshold) return;

    // Determine primary direction
    if (Math.abs(dx) > Math.abs(dy)) {
      this.onDirection(dx > 0 ? 1 : -1, 0);
    } else {
      this.onDirection(0, dy > 0 ? 1 : -1);
    }
  }

  /**
   * Handle virtual D-pad button press
   */
  _handleDpad(e) {
    const dir = e.currentTarget.dataset.dir;
    switch (dir) {
      case 'up': this.onDirection(0, -1); break;
      case 'down': this.onDirection(0, 1); break;
      case 'left': this.onDirection(-1, 0); break;
      case 'right': this.onDirection(1, 0); break;
    }
  }

  /**
   * Handle D-pad touchstart (prevents default, delegates to dpad handler)
   */
  _handleDpadTouch(e) {
    e.preventDefault();
    this._dpadHandler(e);
  }

  /**
   * Clean up all event listeners (no leaks)
   */
  destroy() {
    window.removeEventListener('keydown', this._keyHandler);
    window.removeEventListener('resize', this._resizeHandler);

    if (this.canvasElement) {
      this.canvasElement.removeEventListener('touchstart', this._touchStartHandler);
      this.canvasElement.removeEventListener('touchend', this._touchEndHandler);
    }

    // Cleanly remove D-pad listeners using tracked references
    this._dpadButtons.forEach(btn => {
      btn.removeEventListener('pointerdown', this._dpadHandler);
      btn.removeEventListener('touchstart', this._dpadTouchHandler);
    });
    this._dpadButtons = [];
    this.directionQueue.length = 0;
  }
}
