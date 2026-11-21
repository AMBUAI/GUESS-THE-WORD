const MUTE_KEY = 'gtw_sound_muted';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

function playTone(freq: number, duration: number, delay = 0, type: OscillatorType = 'sine', volume = 0.08): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const startAt = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export function playJoinSound(): void {
  playTone(523.25, 0.12, 0, 'triangle', 0.06);
  playTone(659.25, 0.14, 0.06, 'triangle', 0.06);
}

export function playSubmitSound(): void {
  playTone(440, 0.1, 0, 'sine', 0.07);
  playTone(587.33, 0.14, 0.05, 'sine', 0.07);
}

export function playMismatchSound(): void {
  playTone(392.0, 0.16, 0, 'triangle', 0.06);
  playTone(329.63, 0.22, 0.12, 'triangle', 0.06);
}

export function playVictorySound(): void {
  playTone(523.25, 0.16, 0, 'triangle', 0.08);
  playTone(659.25, 0.16, 0.09, 'triangle', 0.08);
  playTone(783.99, 0.18, 0.18, 'triangle', 0.08);
  playTone(1046.5, 0.38, 0.27, 'triangle', 0.09);
}
