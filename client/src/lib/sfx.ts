/** Shared WebAudio context — must be resumed after a user gesture on WebView2. */
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new Ctx();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/** Call after a user gesture (e.g. enabling Receive) so later SFX can play. */
export async function unlockAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // ignore
    }
  }
}

/** Tiny WebAudio entrance effects — no asset files required. */
export function playEntranceSfx(kind: string, volume = 0.35): void {
  if (!kind || kind === 'none') return;
  if (kind !== 'pop' && kind !== 'whoosh') return;

  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume().then(() => {
    try {
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
      } else {
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
    } catch {
      // Audio may still be blocked — ignore.
    }
  });
}
