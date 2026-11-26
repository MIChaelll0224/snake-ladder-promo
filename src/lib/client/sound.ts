"use client";
// Tiny WebAudio sound effects - no audio files needed.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("sl:muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}
export function isMuted() {
  try {
    muted = localStorage.getItem("sl:muted") === "1";
  } catch {
    /* ignore */
  }
  return muted;
}

function ac(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a click handler once so mobile browsers allow audio. */
export function unlockAudio() {
  ac();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.15, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  roll() {
    for (let i = 0; i < 9; i++) tone(300 + Math.random() * 500, i * 0.1, 0.06, "square", 0.05);
    tone(880, 1.0, 0.25, "triangle", 0.18);
  },
  step() {
    tone(660, 0, 0.06, "triangle", 0.06);
  },
  ladder() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.18, "triangle", 0.14));
  },
  snake() {
    tone(700, 0, 0.7, "sawtooth", 0.08, 120);
  },
  yourTurn() {
    [659, 880, 1175].forEach((f, i) => tone(f, i * 0.12, 0.22, "sine", 0.16));
  },
  tick() {
    tone(1200, 0, 0.04, "square", 0.03);
  },
  join() {
    tone(587, 0, 0.12, "sine", 0.1);
    tone(880, 0.1, 0.16, "sine", 0.1);
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.13, 0.3, "triangle", 0.16));
  },
};
