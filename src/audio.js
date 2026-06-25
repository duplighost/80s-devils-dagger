// Fully procedural synthwave engine — no audio assets. A lookahead scheduler
// drives four-on-the-floor drums, a driving saw bass, a delayed lead arp and a
// pad. Layers fade in with `intensity`. Also exposes a beat envelope the visuals
// pulse to, and a bank of SFX.
const A = 440;
const mtof = (m) => A * Math.pow(2, (m - 69) / 12);

// A-minor progression, one chord per bar.
const PROG = [
  { bass: 33, notes: [57, 60, 64] }, // Am
  { bass: 29, notes: [53, 57, 60] }, // F
  { bass: 36, notes: [55, 60, 64] }, // C(add)
  { bass: 31, notes: [55, 59, 62] }, // G
];

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.musicOn = true;
    this.intensity = 0;
    this.ctx = null;
    this.lastKick = -1;
    this.barNote = 0;
  }

  start() {
    if (this.ready) { this.ctx.resume?.(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    // master chain: bus -> compressor (limiter) -> out
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 24; comp.ratio.value = 12;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.0; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);

    // reverb send (generated impulse)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.8, 2.6);
    this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.master);

    // tape delay for the lead
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 60 / 122 * 0.75; // dotted-ish
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.38;
    this.delayWet = ctx.createGain(); this.delayWet.gain.value = 0.35;
    this.delay.connect(this.delayFb); this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet); this.delayWet.connect(this.master);

    this.noise = this._noiseBuffer();

    this.bpm = 122;
    this.note16 = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.ready = true;

    // fade music in
    this.musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.musicBus.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 2.5);

    this._timer = setInterval(() => this._sched(), 25);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ready) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0.0001, this.ctx.currentTime, 0.2);
  }
  setIntensity(v) { this.intensity = v; }

  // --- beat envelope for visuals (spikes on kick, decays) ---
  getBeat() {
    if (!this.ready) return 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    const dt = this.ctx.currentTime - this.lastKick;
    return Math.max(0, 1 - dt / 0.16);
  }

  // ===================== scheduler =====================
  _sched() {
    if (!this.ready) return;
    const spb = 60 / this.bpm;
    const s16 = spb / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this._step(this.note16, this.nextTime);
      this.note16 = (this.note16 + 1) % 16;
      if (this.note16 === 0) this.barNote = (this.barNote + 1) % PROG.length;
      this.nextTime += s16;
    }
  }

  _step(s, t) {
    const I = this.intensity;
    const chord = PROG[this.barNote];

    // --- drums (four on the floor) ---
    if (s % 4 === 0) { this._kick(t); if (s === 0) this.lastKick = t; else this.lastKick = t; }
    if (s % 8 === 4) this._snare(t, 0.7 + I * 0.3);
    // hats: sparse early, busy later
    if (I > 0.12 && (s % 2 === 0 || (I > 0.5 && true))) this._hat(t, s % 4 === 2 ? 0.5 : 0.25, I);
    if (I > 0.45 && s % 4 === 2) this._snare(t, 0.18); // ghost snare

    // --- bass: driving 8ths ---
    if (s % 2 === 0) {
      const oct = (s % 8 === 4) ? 12 : 0;
      this._bass(mtof(chord.bass + 12 + oct), t, this.musicBus, 0.6);
    }

    // --- pad on bar start ---
    if (s === 0 && I > 0.1) this._pad(chord.notes, t, 2 * 60 / this.bpm);

    // --- lead arp once it heats up ---
    if (I > 0.3) {
      const seq = [0, 1, 2, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1];
      const n = chord.notes[seq[s] % chord.notes.length] + 12;
      if (s % 2 === 0 || I > 0.6) this._lead(mtof(n), t, 0.18 + I * 0.2);
    }
  }

  // ===================== instruments =====================
  _env(node, t, a, d, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _kick(t) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.3);
  }
  _snare(t, vol = 0.7) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(hp); hp.connect(g); g.connect(this.musicBus);
    n.start(t); n.stop(t + 0.2);
  }
  _hat(t, vol, I) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    const dur = 0.03 + Math.random() * 0.03;
    g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp); hp.connect(g); g.connect(this.musicBus);
    n.start(t); n.stop(t + dur + 0.02);
  }
  _bass(freq, t, dest, dur) {
    const o = this.ctx.createOscillator(); const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter(); const g = this.ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -12;
    o.frequency.value = freq; o2.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 380 + this.intensity * 900; f.Q.value = 8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(dest);
    o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }
  _pad(notes, t, dur) {
    for (const m of notes) {
      const o = this.ctx.createOscillator(); const o2 = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter(); const g = this.ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 8;
      o.frequency.value = mtof(m); o2.frequency.value = mtof(m);
      f.type = 'lowpass'; f.frequency.value = 700 + this.intensity * 1400;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.4);
      g.gain.setValueAtTime(0.07, t + dur - 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.musicBus); g.connect(this.reverb);
      o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
    }
  }
  _lead(freq, t, dur) {
    const o = this.ctx.createOscillator(); const f = this.ctx.createBiquadFilter(); const g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 1600 + this.intensity * 2600; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g);
    g.connect(this.musicBus); g.connect(this.delay); g.connect(this.reverb);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ===================== SFX =====================
  _blip(type, f0, f1, dur, vol, dest, q = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); const flt = this.ctx.createBiquadFilter();
    o.type = type; flt.type = 'lowpass'; flt.frequency.value = 4000; flt.Q.value = q;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt); flt.connect(g); g.connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, vol, hp, dest) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    n.start(t); n.stop(t + dur + 0.02);
  }

  shoot()    { this._blip('square', 1200, 380, 0.06, 0.10); }
  shotgun()  { this._blip('sawtooth', 700, 120, 0.16, 0.22, this.sfxBus, 4); this._noise(0.12, 0.12, 800); }
  hit()      { this._blip('triangle', 900, 600, 0.04, 0.07); }
  kill()     { this._blip('sawtooth', 420, 70, 0.22, 0.2, this.sfxBus, 6); this._noise(0.18, 0.1, 500); }
  gem()      { this._blip('sine', 1400, 2100, 0.10, 0.14); }
  upgrade()  {
    if (!this.ready) return;
    const base = 520; [0, 4, 7, 12].forEach((iv, i) => {
      setTimeout(() => this._blip('square', base * Math.pow(2, iv / 12), base * Math.pow(2, iv / 12) * 1.5, 0.18, 0.16), i * 70);
    });
  }
  wave()     { this._blip('sawtooth', 180, 520, 0.5, 0.18, this.sfxBus, 5); }
  volley()   { this._blip('square', 320, 180, 0.12, 0.09, this.sfxBus, 6); }
  slam()     { this._blip('sine', 120, 32, 0.4, 0.32, this.sfxBus, 2); this._noise(0.35, 0.16, 120); }
  uiClick()  { this._blip('square', 880, 880, 0.05, 0.12); }
  playerDeath() {
    this._blip('sawtooth', 600, 40, 1.2, 0.3, this.sfxBus, 3);
    this._noise(0.9, 0.2, 200);
    if (this.ready) this.musicBus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
  }
  musicResume() { if (this.ready && this.musicOn) this.musicBus.gain.setTargetAtTime(0.55, this.ctx.currentTime, 1.5); }

  // ===================== buffers =====================
  _noiseBuffer() {
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  _impulse(dur, decay) {
    const rate = this.ctx.sampleRate; const len = rate * dur;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
}
