// Haptic taps. Android: the Vibration API. iPhone Safari has no Vibration API, but since
// iOS 18 toggling a native <input type="checkbox" switch> produces a light system tap.

let iosSwitch: HTMLLabelElement | null = null;

export function haptic(pattern: number | number[] = 10): void {
  try {
    if (localStorage.getItem('gl.vibration') === 'off') return;
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(pattern); return; }
    if (!iosSwitch) {
      iosSwitch = document.createElement('label');
      iosSwitch.setAttribute('aria-hidden', 'true');
      iosSwitch.style.cssText = 'position:fixed;left:-200px;top:-200px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      iosSwitch.appendChild(input);
      document.body.appendChild(iosSwitch);
    }
    const pulses = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
    for (let i = 0; i < Math.min(pulses, 3); i++) setTimeout(() => iosSwitch?.click(), i * 140);
  } catch { /* no haptics available */ }
}
