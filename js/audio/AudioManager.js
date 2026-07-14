/**
 * AudioManager - Procedural audio generation using Web Audio API
 *
 * No external audio files needed. All sounds are synthesized in real-time.
 *
 * Sound Effects:
 *   eat       - Rising chirp when food is eaten (pitch varies with combo)
 *   item      - Sparkling arpeggio when power-up is picked up
 *   death     - Cinematic descending crash on death
 *   combo     - Triumphant chime at combo milestones (×5, ×10, etc.)
 *   start     - Ascending "get ready" sweep when game starts
 *   pause     - Muted "drop" when pausing
 *   resume    - Quick "pop" when resuming
 *   achieve   - Celebratory fanfare when achievement unlocks
 *   shieldBrk - Glass-crack sound when shield absorbs a hit
 *   speedUp   - Rising whoosh when speed increases
 *   click     - Subtle UI click for buttons
 *   hover     - Very soft tick for hover
 *
 * Background Music:
 *   Multi-layer generative music with chord progressions,
 *   rhythmic bass, arpeggiated chords, and a melody line.
 *   Uses Am → F → C → G progression (epic yet chill).
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

    // BGM state
    this.bgmNodes = null;       // Active BGM oscillator & gain nodes
    this.bgmPlaying = false;
    this.bgmChordIndex = 0;
    this.bgmMelodyIndex = 0;
    this.bgmNextChordTime = 0;
    this.bgmChordDuration = 2.4; // seconds per chord

    AudioManager.instance = this;
  }

  // ==================== INITIALIZATION ====================

  /**
   * Initialize audio context (must be called from user gesture)
   */
  init() {
    if (this.initialized) return;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Load settings from storage
      const settings = StorageManager.getSettings();
      this.sfxVolume = (settings.sfxVolume != null ? settings.sfxVolume : 70) / 100;
      this.bgmVolume = (settings.bgmVolume != null ? settings.bgmVolume : 40) / 100;
      this.sfxEnabled = settings.soundEnabled !== false;
      this.bgmEnabled = settings.musicEnabled !== false;
      // If BGM volume is 0, treat as disabled
      if (this.bgmVolume <= 0) this.bgmEnabled = false;

      // CRITICAL: Resume AudioContext (browser autoplay policy)
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          console.log('[Audio] Context resumed');
        }).catch(err => {
          console.warn('[Audio] Resume failed:', err.message);
        });
      }

      this.initialized = true;
      console.log('[Audio] Initialized, sample rate:', this.ctx.sampleRate);
    } catch (err) {
      console.warn('[Audio] Web Audio API unavailable:', err.message);
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
   * Helper: create and schedule a simple oscillator + gain pair
   */
  _playTone(freq, type, startTime, duration, volume, rampDown = true, detune = 0) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (detune) osc.detune.setValueAtTime(detune, startTime);

    gain.gain.setValueAtTime(volume, startTime);
    if (rampDown) {
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    } else {
      gain.gain.setValueAtTime(volume, startTime + duration);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);

    return { osc, gain };
  }

  /**
   * Helper: create a noise burst (for percussive sounds)
   */
  _playNoise(startTime, duration, volume, filterFreq = 3000) {
    const ctx = this.ctx;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);
    filter.Q.setValueAtTime(0.8, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
    source.stop(startTime + duration + 0.05);
  }

  // ==================== SOUND EFFECTS ====================

  /**
   * Play eat sound - rising chirp with combo variation
   */
  playEat(comboLevel = 0) {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const baseFreq = 440 + comboLevel * 40;
    const vol = this.sfxVolume * 0.28;

    // Main tone - quick rising chirp
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, now + 0.07);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);

    // Bright overtone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 2, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 3.1, now + 0.05);
    gain2.gain.setValueAtTime(vol * 0.4, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.12);

    // Subtle sub-bass thud for weight
    if (comboLevel >= 3) {
      const sub = ctx.createOscillator();
      const subG = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(55, now);
      subG.gain.setValueAtTime(vol * 0.5, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      sub.connect(subG);
      subG.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.1);
    }
  }

  /**
   * Play item pickup - sparkling ascending arpeggio
   */
  playItem() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.22;
    // Cmaj7 arpeggio: C5 E5 G5 B5 C6
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    const noteSpacing = 0.055;

    notes.forEach((freq, i) => {
      const t = now + i * noteSpacing;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });

    // Add sparkle with high-frequency chime
    this._playTone(2093, 'sine', now + notes.length * noteSpacing, 0.35, vol * 0.6, true, 5);
  }

  /**
   * Play death sound - cinematic descending crash
   */
  playDeath() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.3;

    // Main descending saw
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.55);
    gain.gain.setValueAtTime(vol * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.7);

    // Distorted noise burst
    const noise = ctx.createOscillator();
    const noiseGain = ctx.createGain();
    noise.type = 'square';
    noise.frequency.setValueAtTime(100, now);
    noise.frequency.exponentialRampToValueAtTime(25, now + 0.35);
    noiseGain.gain.setValueAtTime(vol * 0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.45);

    // Low rumble
    const rumble = ctx.createOscillator();
    const rumbleGain = ctx.createGain();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(55, now);
    rumble.frequency.linearRampToValueAtTime(30, now + 0.6);
    rumbleGain.gain.setValueAtTime(vol * 0.5, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    rumble.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);
    rumble.start(now);
    rumble.stop(now + 0.75);
  }

  /**
   * Play combo milestone (×5, ×10, ×15, etc.)
   */
  playCombo(level) {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.2;

    // Three-note ascending fanfare
    const baseNote = 440 + level * 15;
    const notes = [baseNote, baseNote * 1.25, baseNote * 1.5];

    notes.forEach((freq, i) => {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 2 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  /**
   * Play game start sound - ascending "get ready" sweep
   */
  playStart() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.25;

    // Rising sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.35);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.08);
    gain.gain.setValueAtTime(vol, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);

    // Final "ding"
    const ding = ctx.createOscillator();
    const dingGain = ctx.createGain();
    ding.type = 'triangle';
    ding.frequency.setValueAtTime(880, now + 0.35);
    ding.frequency.setValueAtTime(1174.66, now + 0.38);
    dingGain.gain.setValueAtTime(0, now + 0.35);
    dingGain.gain.linearRampToValueAtTime(vol * 0.8, now + 0.37);
    dingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    ding.connect(dingGain);
    dingGain.connect(ctx.destination);
    ding.start(now + 0.35);
    ding.stop(now + 0.7);
  }

  /**
   * Play pause sound - muted descending
   */
  playPause() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.15;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.2);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Play resume sound - quick ascending pop
   */
  playResume() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.15;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.15);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /**
   * Play achievement unlock - triumphant fanfare
   */
  playAchievement() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.25;

    // Triumphant arpeggio: C5 E5 G5 C6 E6
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.08;
      this._playTone(freq, i === 4 ? 'square' : 'triangle', t, 0.4, vol * 0.7, true);
    });

    // Sparkle trail
    this._playTone(2093, 'sine', now + notes.length * 0.08, 0.5, vol * 0.5, true, 8);
    this._playTone(2637, 'sine', now + notes.length * 0.08 + 0.06, 0.45, vol * 0.4, true, 5);
  }

  /**
   * Play shield break - glass-like crack
   */
  playShieldBreak() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.22;

    // High-frequency crash
    this._playNoise(now, 0.15, vol * 0.6, 6000);

    // Descending glassy tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
    gain.gain.setValueAtTime(vol * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    // Metallic ring
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(2400, now + 0.05);
    ring.frequency.exponentialRampToValueAtTime(1600, now + 0.3);
    ringGain.gain.setValueAtTime(vol * 0.3, now + 0.05);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.start(now + 0.05);
    ring.stop(now + 0.45);
  }

  /**
   * Play speed increase whoosh
   */
  playSpeedUp(level) {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.12;
    const baseFreq = 200 + level * 80;

    // Whoosh
    this._playNoise(now, 0.2, vol * 0.4, 2000 + level * 500);

    // Rising pitch indicator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, now + 0.18);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Play UI button click
   */
  playClick() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.06;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Play UI hover tick
   */
  playHover() {
    if (!this.initialized || !this.sfxEnabled) return;
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this.sfxVolume * 0.03;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  // ==================== BACKGROUND MUSIC ====================

  /**
   * Start background music - generative multi-layer music
   *
   * Layers:
   *   1. Sub-bass (simple root notes, deep and warm)
   *   2. Pad chords (slowly evolving, ambient)
   *   3. Rhythmic arpeggio (8th-note pattern, adds motion)
   *   4. Melody line (wandering pentatonic melody)
   *   5. Subtle percussion (soft rhythmic pulses)
   *
   * Chord progression: Am → F → C → G (vi-IV-I-V in C major)
   */
  startBgm() {
    if (!this.initialized || !this.bgmEnabled) return;
    if (this.bgmNodes) return; // Already playing
    this.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const masterVol = this.bgmVolume * 0.07;

    // Master gain for all BGM layers
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVol, now);
    masterGain.connect(ctx.destination);

    // === Chord Progression: Am → F → C → G ===
    // Frequencies for each chord (in Hz, bass register + pads in mid)
    const progression = [
      { name: 'Am', root: 55.00, notes: [55.00, 65.41, 82.41, 110.00, 130.81] },     // A2 C3 E3 A3 C4
      { name: 'F',  root: 43.65, notes: [43.65, 65.41, 87.31, 109.99, 130.81] },      // F2 C3 F3 A3 C4
      { name: 'C',  root: 65.41, notes: [65.41, 82.41, 98.00, 130.81, 164.81] },       // C3 E3 G3 C4 E4
      { name: 'G',  root: 49.00, notes: [49.00, 73.42, 98.00, 123.47, 146.83] },       // G2 B2 D3 G3 B3
    ];

    // Pentatonic melody notes (A minor pentatonic: A C D E G)
    const melodyPool = [
      220.00, 261.63, 293.66, 329.63, 392.00,  // A3 C4 D4 E4 G4
      440.00, 523.25, 587.33, 659.25, 783.99,  // A4 C5 D5 E5 G5
    ];

    // Melody patterns (rhythmic sequences)
    const melodyPatterns = [
      [0, 2, 4, 7, 5, 4, 2, 0],     // Ascending then descending
      [4, 5, 7, 9, 8, 7, 5, 4],     // Higher register
      [0, 4, 7, 4, 2, 7, 5, 0],     // Leaping
      [7, 5, 4, 2, 0, 4, 7, 9],     // Reverse
    ];

    // === Layer 1: Sub-bass (root notes) ===
    const bassGain = ctx.createGain();
    bassGain.gain.setValueAtTime(1.2, now);
    bassGain.connect(masterGain);
    const bassOsc = ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(progression[0].root, now);
    bassOsc.connect(bassGain);
    bassOsc.start(now);

    // === Layer 2: Pad (evolving ambient chord) ===
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.6, now);
    padGain.connect(masterGain);

    const padOscs = [];
    const chord = progression[0];
    chord.notes.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(padGain);
      osc.start(now);
      padOscs.push(osc);
    });

    // LFO for pad movement (slow detune modulation)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.1, now);  // Very slow wobble
    lfoGain.gain.setValueAtTime(3, now);
    lfo.connect(lfoGain);
    padOscs.forEach(o => lfoGain.connect(o.frequency));
    lfo.start(now);

    // === Layer 3: Arpeggio (rhythmic 8th notes) ===
    const arpGain = ctx.createGain();
    arpGain.gain.setValueAtTime(0.35, now);
    arpGain.connect(masterGain);

    let arpNoteIndex = 0;
    const arpInterval = setInterval(() => {
      if (!this.bgmNodes) {
        clearInterval(arpInterval);
        return;
      }
      const chord = progression[this.bgmChordIndex];
      const noteIdx = arpNoteIndex % chord.notes.length;
      const freq = chord.notes[noteIdx] * 2; // Octave up

      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
      arpNoteIndex++;
    }, 150); // 150ms = 8th notes at 100bpm

    // === Layer 4: Melody ===
    const melodyGain = ctx.createGain();
    melodyGain.gain.setValueAtTime(0.4, now);
    melodyGain.connect(masterGain);

    let melodyPatternIndex = 0;
    let melodyStepInPattern = 0;
    let melodyRestCount = 0;

    const melodyInterval = setInterval(() => {
      if (!this.bgmNodes) {
        clearInterval(melodyInterval);
        return;
      }

      // Occasionally rest (skip a note) for phrasing
      melodyRestCount++;
      if (melodyRestCount % 16 === 0) {
        melodyStepInPattern++;
        return; // Musical rest / breath
      }

      const pattern = melodyPatterns[melodyPatternIndex % melodyPatterns.length];
      const noteIdx = pattern[melodyStepInPattern % pattern.length];
      const freq = melodyPool[noteIdx];

      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      // Soft attack
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.04);
      g.gain.setValueAtTime(0.2, ctx.currentTime + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);

      melodyStepInPattern++;
      if (melodyStepInPattern >= pattern.length * 2) {
        melodyStepInPattern = 0;
        melodyPatternIndex++;
      }
    }, 370); // Melody note spacing

    // === Layer 5: Rhythmic pulse (subtle) ===
    const pulseInterval = setInterval(() => {
      if (!this.bgmNodes) {
        clearInterval(pulseInterval);
        return;
      }
      // Soft sub-bass pulse on beat 1
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(82.41, ctx.currentTime);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }, this.bgmChordDuration * 1000);

    // === Chord Progression Timer ===
    const chordInterval = setInterval(() => {
      if (!this.bgmNodes) {
        clearInterval(chordInterval);
        return;
      }
      // Move to next chord
      this.bgmChordIndex = (this.bgmChordIndex + 1) % progression.length;
      const chord = progression[this.bgmChordIndex];

      // Smooth transition: update bass
      bassOsc.frequency.cancelScheduledValues(ctx.currentTime);
      bassOsc.frequency.setValueAtTime(chord.root, ctx.currentTime);
      bassOsc.frequency.linearRampToValueAtTime(chord.root, ctx.currentTime + 0.3);

      // Update pad notes
      padOscs.forEach((osc, i) => {
        if (i < chord.notes.length) {
          osc.frequency.cancelScheduledValues(ctx.currentTime);
          osc.frequency.setValueAtTime(chord.notes[i], ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(chord.notes[i], ctx.currentTime + 0.5);
        }
      });

      // Reset arp for new chord
      arpNoteIndex = 0;
    }, this.bgmChordDuration * 1000);

    // === Store references ===
    this.bgmNodes = {
      masterGain,
      bassOsc, bassGain,
      padOscs, padGain,
      arpInterval, arpGain,
      melodyInterval, melodyGain,
      pulseInterval,
      chordInterval,
      lfo, lfoGain,
    };
    this.bgmPlaying = true;
    this.bgmChordIndex = 0;
  }

  /**
   * Stop background music with smooth fade-out
   */
  stopBgm() {
    if (!this.bgmNodes) return;
    const ctx = this.ctx;
    if (!ctx) return;

    const b = this.bgmNodes;

    // Clear all intervals
    clearInterval(b.arpInterval);
    clearInterval(b.melodyInterval);
    clearInterval(b.pulseInterval);
    clearInterval(b.chordInterval);

    // Fade out master
    const now = ctx.currentTime;
    b.masterGain.gain.cancelScheduledValues(now);
    b.masterGain.gain.setValueAtTime(b.masterGain.gain.value, now);
    b.masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    // Stop oscillators after fade
    const allOscs = [b.bassOsc, b.lfo, ...b.padOscs];
    setTimeout(() => {
      allOscs.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } });
    }, 1100);

    this.bgmNodes = null;
    this.bgmPlaying = false;
  }

  /**
   * Restart BGM (e.g., after toggling off/on)
   */
  restartBgm() {
    this.stopBgm();
    // Small delay to let the old nodes fully stop
    setTimeout(() => {
      if (this.bgmEnabled && this.initialized) {
        this.startBgm();
      }
    }, 100);
  }

  // ==================== VOLUME & TOGGLE CONTROLS ====================

  /**
   * Set SFX volume (0.0 - 1.0)
   */
  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  /**
   * Set BGM volume and update playing BGM
   */
  setBgmVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    // If volume is 0, stop BGM entirely
    if (this.bgmVolume <= 0 && this.bgmPlaying) {
      this.bgmEnabled = false;
      this.stopBgm();
      return;
    }
    // If volume was 0 and now > 0, restart BGM if enabled
    if (this.bgmVolume > 0 && !this.bgmPlaying && this.bgmEnabled) {
      this.startBgm();
      return;
    }
    // Update volume on playing BGM
    if (this.bgmNodes && this.bgmNodes.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.bgmNodes.masterGain.gain.cancelScheduledValues(now);
      this.bgmNodes.masterGain.gain.setValueAtTime(this.bgmVolume * 0.07, now);
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
   * Toggle SFX only
   */
  toggleSfx() {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  /**
   * Toggle BGM only
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

  /**
   * Clean up all audio resources
   */
  destroy() {
    this.stopBgm();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.initialized = false;
  }
}

// Create singleton instance
AudioManager.instance = null;
