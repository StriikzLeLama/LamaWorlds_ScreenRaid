/** Tiny WebAudio entrance effects — no asset files required. */
export function playEntranceSfx(kind: string, volume = 0.35): void {
  if (!kind || kind === 'none') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(1, Math.max(0.05, volume)), now + 0.02);

    if (kind === 'pop') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (kind === 'whoosh') {
      const bufferSize = ctx.sampleRate * 0.25;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(220, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      noise.connect(filter);
      filter.connect(gain);
      noise.start(now);
      noise.stop(now + 0.26);
    }

    window.setTimeout(() => void ctx.close().catch(() => undefined), 500);
  } catch {
    // Audio may be blocked until a user gesture — ignore.
  }
}
