// Short vibrations for the timer on phones. Android browsers support the Vibration API.
// iOS Safari does not, but since iOS 18 toggling a native switch control gives a light
// tap, which is used as a fallback where the API is missing.

const PATTERNS = {
  ready: 12, // A light tick: you can let go now.
  start: 28, // A firmer pulse as the timer starts.
  stop: [22, 60, 22], // Two pulses, so stopping never feels like starting.
};

let iosSwitch = null;

function iosTap() {
  if (typeof document === 'undefined') return;
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10px;top:-10px';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

const isTouchDevice = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function haptic(kind) {
  const pattern = PATTERNS[kind];
  if (!pattern || typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw without a recent user gesture. Nothing to do.
    }
    return;
  }
  if (isTouchDevice()) iosTap();
}
