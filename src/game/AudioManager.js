/**
 * Procedural SFX via Web Audio (no asset files required).
 */
export class AudioManager {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.unlocked = false;
    this.sfxVolume = 0.55;
    this._lastShotAt = 0;
  }

  unlock() {
    this.unlocked = true;
    this._ensureCtx();
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** @param {number} freq @param {number} dur @param {string} type @param {number} vol */
  _tone(freq, dur, type = 'sine', vol = 0.2) {
    if (!this.unlocked) return;
    const ctx = this._ensureCtx();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol * this.sfxVolume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** @param {number} dur @param {number} vol */
  _noise(dur, vol = 0.15) {
    if (!this.unlocked) return;
    const ctx = this._ensureCtx();
    const t0 = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * this.sfxVolume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.01);
  }

  placeTower() {
    this._tone(110, 0.12, 'triangle', 0.25);
    this._noise(0.06, 0.12);
  }

  /** @param {'direct' | 'ballistic' | 'cannon' | 'turret' | 'needle' | 'boulder'} kind */
  shoot(kind) {
    const now = performance.now();
    if (now - this._lastShotAt < 40) return;
    this._lastShotAt = now;

    if (kind === 'ballistic' || kind === 'boulder') {
      this._noise(0.14, 0.18);
      this._tone(95, 0.08, 'sawtooth', 0.12);
      return;
    }
    if (kind === 'cannon') {
      this._noise(0.2, 0.24);
      this._tone(65, 0.14, 'sawtooth', 0.2);
      return;
    }
    if (kind === 'turret') {
      this._tone(780, 0.03, 'square', 0.1);
      return;
    }
    this._tone(620, 0.06, 'square', 0.14);
    this._tone(880, 0.04, 'sine', 0.08);
  }

  /** @param {'direct' | 'ballistic' | 'cannon' | 'turret' | 'needle' | 'boulder'} [kind] */
  impact(kind = 'needle') {
    if (kind === 'ballistic' || kind === 'boulder' || kind === 'cannon') {
      this._tone(70, 0.2, 'triangle', 0.3);
      this._noise(0.12, 0.22);
      return;
    }
    if (kind === 'turret') {
      this._tone(300, 0.05, 'triangle', 0.1);
      return;
    }
    this._tone(240, 0.08, 'triangle', 0.15);
  }

  enemyDeath() {
    this._tone(340, 0.1, 'sawtooth', 0.12);
    this._tone(180, 0.14, 'sine', 0.1);
  }

  leak() {
    this._tone(160, 0.25, 'sawtooth', 0.2);
    this._tone(90, 0.35, 'triangle', 0.15);
  }

  waveStart() {
    this._tone(220, 0.12, 'triangle', 0.2);
    this._tone(330, 0.18, 'triangle', 0.22);
    this._tone(440, 0.22, 'sine', 0.18);
  }

  uiClick() {
    this._tone(520, 0.04, 'sine', 0.08);
  }
}
