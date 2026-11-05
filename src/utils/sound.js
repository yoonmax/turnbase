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

/** A small plastic click made of filtered noise, varied a little per turn. */
export function turnClick() {
  const ac = context();
  if (!ac) return;
  const length = Math.floor(ac.sampleRate * 0.03);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800 + Math.random() * 500;
  filter.Q.value = 1.4;
  const gain = ac.createGain();
  gain.gain.value = 0.22;
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start();
}
