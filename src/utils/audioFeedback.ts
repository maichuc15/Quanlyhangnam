/**
 * Procedural Web Audio tactile sound feedback for XR interactions.
 * Zero external audio file dependencies.
 */
class AudioFeedback {
  private ctx: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType, gainPeak: number, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playSelect() {
    this.playTone(540, 0.09, 'sine', 0.06);
  }

  playConfirm() {
    this.playTone(523.25, 0.11, 'sine', 0.06, 0);
    this.playTone(659.25, 0.14, 'sine', 0.07, 0.07);
  }

  playSuccess() {
    this.playTone(523.25, 0.1, 'triangle', 0.05, 0);
    this.playTone(659.25, 0.1, 'triangle', 0.06, 0.07);
    this.playTone(783.99, 0.18, 'sine', 0.06, 0.14);
  }

  playWarning() {
    this.playTone(320, 0.14, 'sawtooth', 0.04, 0);
    this.playTone(260, 0.18, 'sawtooth', 0.04, 0.1);
  }
}

export const audioFeedback = new AudioFeedback();
