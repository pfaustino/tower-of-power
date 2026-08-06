const BGM_TRACKS = [
  'audio/mfcc-warrior-defense-fighting-music-335681.mp3',
  'audio/mfcc-fighting-warrior-defense-music-354629.mp3',
  'audio/mfcc-warrior-fighting-defense-music-323853.mp3',
];

/**
 * Procedural SFX via Web Audio; background music from public/audio MP3s.
 */
export class AudioManager {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.unlocked = false;
    this.sfxVolume = 0.55;
    this.musicVolume = 0.45;
    this._lastShotAt = 0;
    this.bgm = new Audio();
    this.bgm.preload = 'auto';
    this.bgmTrackIndex = 0;
    this.bgmPlaying = false;
    this.bgmPaused = false;
    this.bgm.addEventListener('ended', () => this._playNextTrack());
  }

  unlock() {
    this.unlocked = true;
    this._ensureCtx();
    this.startMusic();
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

  /** @param {number} freq @param {number} at @param {number} dur @param {string} type @param {number} vol @param {number | null} [freqEnd] */
  _scheduleTone(freq, at, dur, type = 'sine', vol = 0.2, freqEnd = null) {
    if (!this.unlocked) return;
    const ctx = this._ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), at + dur);
    }
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol * this.sfxVolume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.03);
  }

  /** @param {number} dur @param {number} at @param {number} vol */
  _scheduleNoise(dur, at, vol = 0.15) {
    if (!this.unlocked) return;
    const ctx = this._ensureCtx();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * this.sfxVolume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  /** @param {number} dur @param {number} vol */
  _noise(dur, vol = 0.15) {
    if (!this.unlocked) return;
    this._scheduleNoise(dur, this._ensureCtx().currentTime, vol);
  }

  /** Rising radar sweep + alert pings for wave intro. */
  _waveIntro() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    this._scheduleNoise(0.22, t0, 0.1);
    this._scheduleTone(160, t0 + 0.04, 0.28, 'sawtooth', 0.14, 420);
    this._scheduleTone(440, t0 + 0.22, 0.09, 'square', 0.11);
    this._scheduleTone(440, t0 + 0.34, 0.09, 'square', 0.11);
    this._scheduleTone(554, t0 + 0.46, 0.12, 'square', 0.13);
    this._scheduleTone(330, t0 + 0.58, 0.2, 'triangle', 0.16);
    this._scheduleTone(660, t0 + 0.6, 0.14, 'sine', 0.08);
  }

  /** Bright major arpeggio when a wave is cleared. */
  _waveOutro() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      this._scheduleTone(freq, t0 + i * 0.09, 0.22, 'sine', 0.14);
      this._scheduleTone(freq * 2, t0 + i * 0.09 + 0.02, 0.12, 'triangle', 0.05);
    });
    this._scheduleTone(1318.5, t0 + 0.42, 0.35, 'sine', 0.1);
  }

  /** Low descending sting when the outpost is overrun. */
  _waveFail() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    this._scheduleNoise(0.45, t0, 0.18);
    this._scheduleTone(196, t0 + 0.05, 0.35, 'sawtooth', 0.2, 98);
    this._scheduleTone(155, t0 + 0.28, 0.4, 'sawtooth', 0.18, 78);
    this._scheduleTone(123, t0 + 0.55, 0.55, 'triangle', 0.16, 62);
    this._scheduleTone(146.83, t0 + 0.62, 0.3, 'square', 0.06);
    this._scheduleTone(138.59, t0 + 0.66, 0.3, 'square', 0.06);
  }

  /** Triumphant fanfare for final victory. */
  _waveVictory() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    const fanfare = [
      [392, 0, 0.18],
      [523.25, 0.14, 0.18],
      [659.25, 0.28, 0.22],
      [783.99, 0.44, 0.28],
      [1046.5, 0.62, 0.45],
    ];
    for (const [freq, offset, dur] of fanfare) {
      this._scheduleTone(freq, t0 + offset, dur, 'triangle', 0.17);
      this._scheduleTone(freq * 0.5, t0 + offset + 0.02, dur * 0.85, 'sawtooth', 0.07);
    }
    this._scheduleTone(1318.5, t0 + 0.95, 0.7, 'sine', 0.12);
    this._scheduleTone(1568, t0 + 1.05, 0.55, 'sine', 0.08);
  }

  /** @param {'start' | 'complete' | 'failure' | 'victory'} variant */
  waveAnnouncement(variant) {
    switch (variant) {
      case 'start':
        this._waveIntro();
        break;
      case 'complete':
        this._waveOutro();
        break;
      case 'failure':
        this._waveFail();
        break;
      case 'victory':
        this._waveVictory();
        break;
      default:
        break;
    }
  }

  placeTower() {
    this._tone(110, 0.12, 'triangle', 0.25);
    this._noise(0.06, 0.12);
  }

  /** @param {'direct' | 'ballistic' | 'cannon' | 'turret' | 'needle' | 'boulder' | 'oil'} kind */
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
    if (kind === 'oil') {
      this._noise(0.12, 0.14);
      this._tone(120, 0.1, 'triangle', 0.14);
      return;
    }
    if (kind === 'turret') {
      this._tone(780, 0.03, 'square', 0.1);
      return;
    }
    this._tone(620, 0.06, 'square', 0.14);
    this._tone(880, 0.04, 'sine', 0.08);
  }

  /** @param {'direct' | 'ballistic' | 'cannon' | 'turret' | 'needle' | 'boulder' | 'oil'} [kind] */
  impact(kind = 'needle') {
    if (kind === 'oil') {
      this._noise(0.18, 0.2);
      this._tone(90, 0.12, 'sawtooth', 0.16);
      this._tone(180, 0.2, 'triangle', 0.1);
      return;
    }
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

  crystalCollect() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    this._scheduleTone(1318.5, t0, 0.07, 'sine', 0.12);
    this._scheduleTone(1760, t0 + 0.055, 0.16, 'sine', 0.14);
    this._scheduleTone(2637, t0 + 0.055, 0.1, 'triangle', 0.06);
  }

  leak() {
    this._tone(160, 0.25, 'sawtooth', 0.2);
    this._tone(90, 0.35, 'triangle', 0.15);
  }

  waveStart() {
    this._waveIntro();
  }

  uiClick() {
    this._tone(520, 0.04, 'sine', 0.08);
  }

  bossTelegraph() {
    this._tone(140, 0.18, 'sawtooth', 0.16);
    this._tone(220, 0.28, 'triangle', 0.12);
  }

  bossKill() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    this._scheduleTone(220, t0, 0.12, 'sawtooth', 0.18);
    this._scheduleTone(440, t0 + 0.08, 0.16, 'triangle', 0.16);
    this._scheduleTone(660, t0 + 0.18, 0.22, 'sine', 0.14);
    this._scheduleNoise(0.2, t0 + 0.05, 0.12);
  }

  abilityFreeze() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    this._scheduleTone(880, t0, 0.2, 'sine', 0.12, 220);
    this._scheduleTone(1320, t0 + 0.05, 0.25, 'triangle', 0.1, 330);
  }

  abilityStrike() {
    this._tone(60, 0.22, 'sawtooth', 0.28);
    this._noise(0.25, 0.22);
    this._tone(180, 0.3, 'triangle', 0.14);
  }

  abilityOverclock() {
    if (!this.unlocked) return;
    const t0 = this._ensureCtx().currentTime;
    this._scheduleTone(520, t0, 0.08, 'square', 0.1);
    this._scheduleTone(780, t0 + 0.07, 0.1, 'square', 0.12);
    this._scheduleTone(1040, t0 + 0.14, 0.16, 'triangle', 0.12);
  }

  /** @param {number} volume 0–1 */
  setSfxVolume(volume) {
    this.sfxVolume = Math.min(1, Math.max(0, volume));
  }

  /** @param {number} volume 0–1 */
  setMusicVolume(volume) {
    this.musicVolume = Math.min(1, Math.max(0, volume));
    this._applyBgmVolume();
  }

  _trackUrl(index) {
    const path = BGM_TRACKS[index % BGM_TRACKS.length];
    return `${import.meta.env.BASE_URL}${path}`;
  }

  _applyBgmVolume() {
    this.bgm.volume = this.musicVolume;
  }

  /** @param {number} index */
  _loadAndPlayTrack(index) {
    this.bgmTrackIndex = index % BGM_TRACKS.length;
    this.bgm.src = this._trackUrl(this.bgmTrackIndex);
    this._applyBgmVolume();
    this.bgm.play().catch(() => {});
  }

  _playNextTrack() {
    if (!this.bgmPlaying || this.bgmPaused) return;
    this._loadAndPlayTrack(this.bgmTrackIndex + 1);
  }

  startMusic() {
    if (!this.unlocked || this.bgmPlaying) return;
    this.bgmPlaying = true;
    this.bgmPaused = false;
    this._loadAndPlayTrack(this.bgmTrackIndex);
  }

  pauseMusic() {
    if (!this.bgmPlaying || this.bgmPaused) return;
    this.bgmPaused = true;
    this.bgm.pause();
  }

  resumeMusic() {
    if (!this.bgmPlaying || !this.bgmPaused) return;
    this.bgmPaused = false;
    this.bgm.play().catch(() => {});
  }
}
