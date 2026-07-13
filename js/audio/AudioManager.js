/**
 * AudioManager - Procedural audio generation using Web Audio API
 *
 * No external audio files needed. All sounds are synthesized in real-time:
 * - eat: Short rising chirp when food is eaten
 * - item: Sparkling arpeggio when item is picked up
 * - death: Low descending tone on death
 * - move: Subtle tick (optional, can be annoying at speed)
 * - combo: Higher pitched variant of eat for combos
 * - bgm: Simple ambient drone loop
 *
 * Singleton pattern - access via AudioManager.instance
 */
class AudioManager {
  constructor() {
    if (AudioManager.instance) return AudioManager.instance;

    this.ctx = null;
    this.initialized = false;
    this.sfxVolume = CONFIG.AUDIO_SFX_VOLUME;
    this.bgmVolume = CONFIG.AUDIO_BGM_VOLUME;
    this.sfxEnabled = true;
    this.bgmEnabled = true;
    this.bgmNodes = null; // Active BGM oscillator nodes

    AudioManager.instance = this;
  }

  /**
   * Initialize audio context (must be called from user gesture)
   */
  init() {
    if (this.initialized) return;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Load settings
      const settings = StorageManager.getSettings();
      this.sfxVolume = (settings.sfxVolume || 70) / 100;
      this.bgmVolume = (settings.bgmVolume || 40) / 100;
      this.sfxEnabled = settings.soundEnabled !== false;
      this.bgmEnabled = settings.musicEnabled !== false;

      // CRITICAL: Resume AudioContext from user gesture (browser autoplay policy)
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          console.log('[Audio] Context resumed successfully');
        }).catch(err => {
          console.warn('[Audio] Failed to resume context:', err.message);
        });
      }

      this.initialized = true;
      console.log('[Audio] Initialized, state:', this.ctx.state);
    } catch (err) {
      console.warn('[Audio] Web Audio API not available:', err.message);
    }
  }

  /**
   * Resume audio context (unlock on mobile)
   */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(err => {
        console.warn('[Audio] Resume failed:', err.message);
      });
    }
  }

  /**
   * Play eat sound effect
   * @param {number} comboLevel - Current combo count for pitch variation
   */
  playEat(comboLevel = 0) {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const baseFreq = 400 + comboLevel * 50;
    const vol = this.sfxVolume * 0.3;

    // Main tone - short rising chirp
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

    // Harmonic overtone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 2, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 3, now + 0.06);
    gain2.gain.setValueAtTime(vol * 0.5, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.12);
  }

  /**
   * Play item pickup sound - sparkling arpeggio
   */
  playItem() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.25;
    const notes = [523, 659, 784, 1047]; // C E G C (ascending)

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(vol, now + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.25);
    });
  }

  /**
   * Play death sound - descending buzz
   */
  playDeath() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.3;

    // Main descending tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.65);

    // Noise burst
    const noise = ctx.createOscillator();
    const noiseGain = ctx.createGain();
    noise.type = 'square';
    noise.frequency.setValueAtTime(80, now);
    noise.frequency.exponentialRampToValueAtTime(20, now + 0.3);
    noiseGain.gain.setValueAtTime(vol * 0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.4);
  }

  /**
   * Play combo milestone sound
   */
  playCombo(level) {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.2;
    const baseFreq = 500 + level * 30;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.setValueAtTime(baseFreq * 1.25, now + 0.05);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  /**
   * Start background music - ambient chord progression with melody
   */
  startBgm() {
    if (!this.initialized || !this.bgmEnabled) return;
    if (this.bgmNodes) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.bgmVolume * 0.06;

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(vol, now);
    masterGain.connect(ctx.destination);

    // Pad oscillators (ambient drone chords)
    const padNotes = [55, 65.41, 82.41]; // A1, C2, E2
    const padOscs = padNotes.map(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.35, now);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      return osc;
    });

    // Subtle melody pattern
    const melodyNotes = [220, 261.63, 293.66, 329.63, 293.66, 261.63, 220, 196]; // A3 scale
    let melodyIndex = 0;
    const melodyGain = ctx.createGain();
    melodyGain.gain.setValueAtTime(0.12, now);
    melodyGain.connect(masterGain);

    const playMelodyNote = () => {
      if (!this.bgmNodes) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(melodyNotes[melodyIndex % melodyNotes.length], ctx.currentTime);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(g); g.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.9);
      melodyIndex++;
    };

    // Rhythm - gentle pulse
    const rhythmGain = ctx.createGain();
    rhythmGain.gain.setValueAtTime(0.08, now);
    rhythmGain.connect(masterGain);
    const rhythmOsc = ctx.createOscillator();
    rhythmOsc.type = 'sine';
    rhythmOsc.frequency.setValueAtTime(110, now); // A2 pulse
    rhythmOsc.connect(rhythmGain);
    rhythmOsc.start(now);

    // Slow LFO for pad movement
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.08, now);
    lfoGain.gain.setValueAtTime(2, now);
    lfo.connect(lfoGain);
    padOscs.forEach(o => lfoGain.connect(o.frequency));
    lfo.start(now);

    // Melody timer
    const melodyInterval = setInterval(playMelodyNote, 1800);
    playMelodyNote();

    this.bgmNodes = {
      padOscs, masterGain, lfo, lfoGain, rhythmOsc, rhythmGain,
      melodyInterval, melodyGain
    };
  }

  /**
   * Stop background music
   */
  stopBgm() {
    if (!this.bgmNodes) return;
    const { padOscs, masterGain, lfo, rhythmOsc, melodyInterval } = this.bgmNodes;
    const ctx = this.ctx;
    if (!ctx) return;

    clearInterval(melodyInterval);
    const now = ctx.currentTime;
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    setTimeout(() => {
      padOscs.forEach(o => { try { o.stop(); } catch(e) {} });
      try { lfo.stop(); } catch(e) {}
      try { rhythmOsc.stop(); } catch(e) {}
    }, 900);

    this.bgmNodes = null;
  }

  /**
   * Set SFX volume
   */
  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  /**
   * Set BGM volume and update playing bgm
   */
  setBgmVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    if (this.bgmNodes && this.ctx) {
      this.bgmNodes.gain.gain.setValueAtTime(
        this.bgmVolume * 0.08,
        this.ctx.currentTime
      );
    }
  }

  /**
   * Toggle all sound (SFX + BGM)
   */
  setSoundEnabled(enabled) {
    this.sfxEnabled = enabled;
    this.bgmEnabled = enabled;
    if (!enabled) {
      this.stopBgm();
    } else if (!this.bgmNodes) {
      this.startBgm();
    }
  }

  /**
   * Toggle SFX
   */
  toggleSfx() {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  /**
   * Toggle BGM
   */
  toggleBgm() {
    this.bgmEnabled = !this.bgmEnabled;
    if (this.bgmEnabled) {
      this.startBgm();
    } else {
      this.stopBgm();
    }
    return this.bgmEnabled;
  }
}

// Create singleton instance
AudioManager.instance = null;
