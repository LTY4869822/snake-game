/**
 * ParticleSystem - Manages particle effects for visual feedback
 *
 * Particle types:
 * - eat:      Small colored burst when snake eats food
 * - item:     Larger burst when picking up an item
 * - score:    Floating score number that rises and fades
 * - death:    Large burst on snake death
 * - trail:    Slight trailing particles behind snake (ambient)
 */
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.screenShake = { intensity: 0, duration: 0, elapsed: 0 };
  }

  /**
   * Emit particles at a position
   * @param {string} type - 'eat' | 'item' | 'score' | 'death' | 'trail'
   * @param {number} x - Pixel X position
   * @param {number} y - Pixel Y position
   * @param {object} options - Type-specific options
   */
  emit(type, x, y, options = {}) {
    switch (type) {
      case 'eat':
        this.emitEat(x, y, options.color || '#ff6b6b');
        break;
      case 'item':
        this.emitItem(x, y, options.color || '#ffd700');
        break;
      case 'score':
        this.emitScoreText(x, y, options.text || '+10', options.color || '#ffffff');
        break;
      case 'death':
        this.emitDeath(x, y, options.color || '#6c5ce7');
        this.startScreenShake(8, 300);
        break;
      case 'trail':
        this.emitTrail(x, y, options.color || '#6c5ce7');
        break;
    }
  }

  /**
   * Food collection particles
   */
  emitEat(x, y, color) {
    const count = CONFIG.PARTICLE_EAT_COUNT;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 60 + Math.random() * 100;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        color,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.4 + Math.random() * 0.3,
        gravity: 80,
        shrink: true
      });
    }
  }

  /**
   * Item pickup particles (larger, more dramatic)
   */
  emitItem(x, y, color) {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 80 + Math.random() * 150;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 5,
        color,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 0.5 + Math.random() * 0.5,
        gravity: 100,
        shrink: true
      });
    }
    // Ring burst
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 200,
        vy: Math.sin(angle) * 200,
        radius: 1.5,
        color: '#ffffff',
        life: 0.2,
        maxLife: 0.2,
        gravity: 0,
        shrink: false
      });
    }
  }

  /**
   * Floating score text
   */
  emitScoreText(x, y, text, color) {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 30,
      vy: -60 - Math.random() * 30,
      radius: 0,
      color,
      life: 0.8,
      maxLife: 0.8,
      gravity: 0,
      shrink: false,
      isText: true,
      text
    });
  }

  /**
   * Death explosion
   */
  emitDeath(x, y, color) {
    const count = CONFIG.PARTICLE_DEATH_COUNT;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 50 + Math.random() * 200;
      const hueShift = Math.random() * 60 - 30;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 6,
        color: this.shiftHue(color, hueShift),
        life: 0.6 + Math.random() * 0.8,
        maxLife: 0.6 + Math.random() * 0.8,
        gravity: 60,
        shrink: true
      });
    }
  }

  /**
   * Subtle trail particles
   */
  emitTrail(x, y, color) {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      radius: 1 + Math.random() * 2,
      color,
      life: 0.25 + Math.random() * 0.15,
      maxLife: 0.25 + Math.random() * 0.15,
      gravity: -10,
      shrink: true
    });
  }

  /**
   * Start screen shake effect
   */
  startScreenShake(intensity = 6, duration = 300) {
    this.screenShake = { intensity, duration, elapsed: 0 };
  }

  /**
   * Get current screen shake offset
   * @returns {{x: number, y: number}}
   */
  getShakeOffset() {
    if (this.screenShake.elapsed >= this.screenShake.duration) {
      return { x: 0, y: 0 };
    }
    const progress = this.screenShake.elapsed / this.screenShake.duration;
    const decay = 1 - progress;
    const intensity = this.screenShake.intensity * decay;
    return {
      x: (Math.random() - 0.5) * intensity * 2,
      y: (Math.random() - 0.5) * intensity * 2
    };
  }

  /**
   * Update all particles
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Update screen shake
    if (this.screenShake.elapsed < this.screenShake.duration) {
      this.screenShake.elapsed += dt * 1000;
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        // Remove dead particles by swapping with last
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }

      // Physics update
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;

      // Shrink radius over lifetime
      if (p.shrink) {
        p.radius *= (1 - dt * 1.5);
      }
    }

    // Cap particle count
    if (this.particles.length > CONFIG.PARTICLE_MAX) {
      this.particles.splice(0, this.particles.length - CONFIG.PARTICLE_MAX);
    }
  }

  /**
   * Simple hue shift for color variation
   */
  shiftHue(hex, amount) {
    // Simple: just tweak RGB components slightly
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.min(255, Math.max(0, r + amount));
    const ng = Math.min(255, Math.max(0, g + amount));
    const nb = Math.min(255, Math.max(0, b + amount));
    return `rgb(${nr},${ng},${nb})`;
  }

  /**
   * Clear all particles
   */
  reset() {
    this.particles = [];
    this.screenShake = { intensity: 0, duration: 0, elapsed: 0 };
  }
}
