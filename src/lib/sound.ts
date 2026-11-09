import { load, save } from './storage';

/**
 * Small synthesized sound effects (Web Audio, no files). Phones only allow
 * audio after a tap, so `unlock()` is called from button handlers.
 */

const KEY = 'hsq:sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = load<boolean>(KEY, false);

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call inside a tap handler so later sounds can play on iOS/Android. */
export function unlock() {
  audio();
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  save(KEY, m);
  if (!m) audio();
}

interface Note {
  freq: number;
  /** Seconds from now. */
  at?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  /** Slide to this frequency over the note. */
  to?: number;
}

function tone({ freq, at = 0, dur = 0.12, type = 'sine', gain = 0.25, to }: Note) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  // Quick attack, smooth decay: no clicks.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, { gain = 0.4, from = 1800, to = 120, at = 0 } = {}) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  /** Last seconds of the fuse. */
  tick(urgent = false) {
    tone({ freq: urgent ? 1320 : 990, dur: 0.05, type: 'square', gain: urgent ? 0.07 : 0.04 });
  },
  /** It's your turn. */
  yourTurn() {
    tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.22 });
    tone({ freq: 990, at: 0.09, dur: 0.18, type: 'triangle', gain: 0.22 });
  },
  /** Someone named a card. Brighter when it was you. */
  hit(mine: boolean, streak = 1) {
    // Each answer in a streak rises a step in pitch (up to a fifth).
    const base = (mine ? 784 : 587) * 2 ** (Math.min(Math.max(streak - 1, 0), 7) / 12);
    [0, 4, 7].forEach((semi, i) =>
      tone({ freq: base * 2 ** (semi / 12), at: i * 0.06, dur: 0.16, type: 'triangle', gain: mine ? 0.22 : 0.12 }),
    );
  },
  /** A wrong answer. */
  miss() {
    tone({ freq: 220, dur: 0.18, type: 'sawtooth', gain: 0.08, to: 140 });
  },
  /** The fuse ran out. */
  boom() {
    noise(0.7, { gain: 0.5, from: 2400, to: 80 });
    tone({ freq: 120, dur: 0.45, type: 'sine', gain: 0.35, to: 40 });
  },
  /** Someone joined the room. */
  join() {
    tone({ freq: 520, dur: 0.08, type: 'sine', gain: 0.15, to: 780 });
  },
  /** End of game. */
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, at: i * 0.11, dur: i === 3 ? 0.45 : 0.14, type: 'triangle', gain: 0.22 }));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone({ freq: f, at: i * 0.16, dur: 0.22, type: 'triangle', gain: 0.16 }));
  },
};
