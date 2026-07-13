/**
 * InputManager - Unified input handling for keyboard, touch, and swipe
 *
 * Supports:
 * - Keyboard: WASD and Arrow keys (configurable)
 * - Touch: Virtual D-pad buttons
 * - Swipe: Touch swipe gestures on the canvas
 * - All inputs normalized to direction vectors {x, y}
 */
class InputManager {
  /**
   * @param {object} options - Configuration
   * @param {string} options.controlScheme - 'wasd' or 'arrows'
   * @param {string} options.mobileControl - 'swipe' or 'dpad'
   * @param {function} options.onDirection - Callback(dx, dy) when direction changes
   * @param {function} options.onPause - Callback() when pause requested
   * @param {HTMLElement} options.canvasElement - Canvas for swipe detection
   */
  constructor(options = {}) {
    this.controlScheme = options.controlScheme || 'wasd';
    this.mobileControl = options.mobileControl || 'swipe';
    this.onDirection = options.onDirection || (() => {});
    this.onPause = options.onPause || (() => {});
    this.canvasElement = options.canvasElement || null;

    // Swipe tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.swipeThreshold = 30;     // Minimum px for swipe
    this.swipeTimeThreshold = 500; // Maximum ms for swipe

    // Direction queue to prevent losing fast inputs
    this.directionQueue = [];
    this.maxQueueSize = 3;

    // Bound handlers for cleanup
    this._keyHandler = this._handleKey.bind(this);
    this._touchStartHandler = this._handleTouchStart.bind(this);
    this._touchEndHandler = this._handleTouchEnd.bind(this);
    this._dpadHandler = this._handleDpad.bind(this);

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

    // Virtual D-pad buttons
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      btn.addEventListener('pointerdown', this._dpadHandler);
      // Prevent the d-pad from triggering blur/focus
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._dpadHandler(e);
      });
    });

    // Detect if device has touch capability
    this._updateMobileControls();
    window.addEventListener('resize', () => this._updateMobileControls());
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
      case 'Escape':
      case 'p':
        this.onPause();
        e.preventDefault();
        return;
    }

    if (dx !== 0 || dy !== 0) {
      e.preventDefault();
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
   * Clean up all event listeners
   */
  destroy() {
    window.removeEventListener('keydown', this._keyHandler);

    if (this.canvasElement) {
      this.canvasElement.removeEventListener('touchstart', this._touchStartHandler);
      this.canvasElement.removeEventListener('touchend', this._touchEndHandler);
    }

    document.querySelectorAll('.dpad-btn').forEach(btn => {
      btn.removeEventListener('pointerdown', this._dpadHandler);
    });
  }
}
