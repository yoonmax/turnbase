// Short synthesized sounds. Nothing is loaded from the network. The audio context
// starts on first use, which browsers only allow after a user gesture, and every
// key press that reaches this module has been one.

let ctx = null;

function context() {
  if (!ctx) {
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(frequency, durationS, gainValue = 0.12, startOffset = 0) {
  const ac = context();
  if (!ac) return;
  const t = ac.currentTime + startOffset;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(gainValue, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + durationS);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + durationS + 0.02);
}

/** One beep at 8 s, two at 12 s, matching the judge's two calls. */
export function inspectionCue(cueMs) {
  tone(880, 0.16);
  if (cueMs >= 12000) tone(880, 0.16, 0.12, 0.2);
}

export function readyCue() {
  tone(1320, 0.07, 0.06);
}

export function stopCue() {
  tone(660, 0.09, 0.08);
}

// One second of white noise, made once and reused by every turn sound.
let noise = null;
function noiseBuffer(ac) {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return noise;
}

// A burst of filtered noise: the plastic-on-plastic part of a turn.
function burst(ac, out, { at, duration, frequency, q, gain, type = 'bandpass' }) {
  const source = ac.createBufferSource();
  source.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.0015);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(env).connect(out);
  // A random start in the buffer, so no two turns sound exactly alike.
  source.start(at, Math.random() * 0.9, duration + 0.01);
}

/**
 * A cube turn: a soft woody knock as the layer starts, a crisp snap as it seats, and a
 * faint rattle of the pieces settling. Each part is varied a little per turn.
 */
export function turnClick() {
  const ac = context();
  if (!ac) return;
  const t = ac.currentTime + 0.002;
  const vary = (x, by = 0.12) => x * (1 + (Math.random() * 2 - 1) * by);

  const out = ac.createGain();
  out.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  out.connect(comp).connect(ac.destination);

  // Knock: a short low tone that drops in pitch, like a hollow plastic body.
  const knock = ac.createOscillator();
  knock.type = 'triangle';
  knock.frequency.setValueAtTime(vary(310), t);
  knock.frequency.exponentialRampToValueAtTime(vary(140), t + 0.045);
  const knockGain = ac.createGain();
  knockGain.gain.setValueAtTime(0, t);
  knockGain.gain.linearRampToValueAtTime(0.16, t + 0.002);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  knock.connect(knockGain).connect(out);
  knock.start(t);
  knock.stop(t + 0.07);

  // Snap: the bright edge of the click.
  burst(ac, out, { at: t, duration: 0.018, frequency: vary(3200), q: 1.1, gain: 0.32 });
  // Body: a little lower and longer, which gives the click weight.
  burst(ac, out, { at: t + 0.001, duration: 0.035, frequency: vary(1100), q: 1.6, gain: 0.22 });
  // Settle: a quieter tick as the layer lands.
  burst(ac, out, { at: t + vary(0.03, 0.25), duration: 0.014, frequency: vary(4200), q: 2, gain: 0.08, type: 'highpass' });
}
