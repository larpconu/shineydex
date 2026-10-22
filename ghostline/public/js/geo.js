// Location + screen wake lock.

export function geoSupported() { return 'geolocation' in navigator; }

// Ask for a precise fix once (used for permission prompts and centring maps).
export function getFix({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) return reject(Object.assign(new Error('This browser has no location support.'), { code: 'unsupported' }));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(Object.assign(new Error(geoErrorText(e)), { code: e.code })),
      { enableHighAccuracy: true, timeout, maximumAge: 5000 },
    );
  });
}

export function geoErrorText(e) {
  if (e?.code === 1) return 'Location is blocked. Turn it on for GHOSTLINE (see Location help).';
  if (e?.code === 2) return 'Can’t find you right now. Step outside or toggle Wi-Fi on.';
  if (e?.code === 3) return 'Location is taking too long. Still trying…';
  return e?.message || 'Location failed.';
}

export function watchGps(onFix, onError) {
  if (!geoSupported()) { onError?.({ code: 'unsupported', message: 'No location support.' }); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }),
    (e) => onError?.({ code: e.code, message: geoErrorText(e) }),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

// Keeps the screen awake during a round. iOS web apps stop sharing location when the phone
// locks, so this matters. Re-acquires the lock when you come back to the app.
export function keepAwake(onState) {
  let lock = null, stopped = false;
  const acquire = async () => {
    if (stopped || document.visibilityState !== 'visible') return;
    if (!('wakeLock' in navigator)) { onState?.('unsupported'); return; }
    try {
      lock = await navigator.wakeLock.request('screen');
      onState?.('on');
      lock.addEventListener('release', () => { if (!stopped) onState?.('off'); });
    } catch { onState?.('off'); }
  };
  const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
  document.addEventListener('visibilitychange', onVis);
  acquire();
  return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
}
