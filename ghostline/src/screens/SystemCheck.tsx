import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, CircleAlert, CircleX, Loader, Copy } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { isIOS, isStandalone, iosVersion, versionAtLeast } from '../lib/pwa';
import { loadFirebaseConfig } from '../lib/firebase';
import { syncClock } from '../lib/clock';

type State = 'ok' | 'warn' | 'bad' | 'wait';
interface Check { id: string; title: string; state: State; detail: string }

const ICON: Record<State, ReactNode> = {
  ok: <CircleCheck size={20} />, warn: <CircleAlert size={20} />, bad: <CircleX size={20} />, wait: <Loader size={20} />,
};

/** Shows what works on this phone: install, offline cache, Firebase, server clock, alerts, location, wake lock. */
export function SystemCheck() {
  const [checks, setChecks] = useState<Check[]>(() => initialChecks());
  const set = (id: string, state: State, detail: string) => setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, state, detail } : c)));

  useEffect(() => {
    let alive = true;
    const upd = (id: string, s: State, d: string) => alive && set(id, s, d);
    (async () => {
      if (!('serviceWorker' in navigator)) upd('offline', 'bad', 'This browser has no service worker support.');
      else {
        const reg = await navigator.serviceWorker.getRegistration();
        const cached = (await caches.keys()).some((k) => k.includes('precache'));
        if (reg?.active && cached) upd('offline', 'ok', 'App shell cached. GHOSTLINE opens without a signal.');
        else if (import.meta.env.DEV) upd('offline', 'warn', 'Dev mode: the offline cache only runs in the deployed app.');
        else upd('offline', 'wait', 'Caching for offline use… reopen the app in a moment.');
      }
    })();
    (async () => {
      const cfg = await loadFirebaseConfig();
      upd('firebase', cfg?.projectId ? 'ok' : 'bad', cfg?.projectId ? `Connected to project “${cfg.projectId}”.` : 'Not connected. Deploy with Firebase Hosting (see DEPLOY.md).');
    })();
    (async () => {
      try {
        const { offset, rtt } = await syncClock(3);
        const off = Math.round(offset);
        upd('server', Math.abs(off) > 5000 ? 'warn' : 'ok', `Server reached in ${Math.round(rtt)} ms. Your clock is ${Math.abs(off)} ms ${off >= 0 ? 'behind' : 'ahead of'} the server (corrected automatically).`);
      } catch (e) {
        upd('server', 'bad', `Can't reach the game server: ${(e as Error).message}. Is the health function deployed?`);
      }
    })();
    (async () => {
      if (!('permissions' in navigator) || !('geolocation' in navigator)) return;
      try {
        const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        const map: Record<string, [State, string]> = {
          granted: ['ok', 'Allowed.'], prompt: ['warn', 'Not asked yet. Tap “Test location” below.'], denied: ['bad', 'Blocked. Settings → Privacy & Security → Location Services → Safari Websites → While Using.'],
        };
        upd('location', ...map[p.state]);
      } catch { /* Safari before 16 has no permissions API for geolocation */ }
    })();
    return () => { alive = false; };
  }, []);

  const testLocation = () => {
    set('location', 'wait', 'Asking for a precise fix…');
    navigator.geolocation.getCurrentPosition(
      (p) => set('location', p.coords.accuracy <= 50 ? 'ok' : 'warn', `Got a fix, accurate to about ${Math.round(p.coords.accuracy)} m.${p.coords.accuracy > 50 ? ' Turn on Precise Location for better games.' : ''}`),
      (e) => set('location', 'bad', e.code === 1 ? 'Blocked. Settings → Privacy & Security → Location Services → Safari Websites → While Using, Precise on.' : 'No fix yet. Step outside and try again.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const copyReport = async () => {
    const text = [`GHOSTLINE v${__APP_VERSION__} system check`, navigator.userAgent, ...checks.map((c) => `${c.state.toUpperCase()} · ${c.title}: ${c.detail}`)].join('\n');
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  return (
    <>
      <TopBar title="System check" />
      <div className="stack-16">
        <div className="card flush">
          {checks.map((c) => (
            <div key={c.id} className={`check-row ${c.state}`} data-check={c.id} data-state={c.state}>
              {ICON[c.state]}
              <div className="txt"><div className="title">{c.title}</div><div className="meta">{c.detail}</div></div>
            </div>
          ))}
        </div>
        <Button variant="accent" onClick={testLocation}>Test location</Button>
        <Button variant="secondary" icon={<Copy size={20} />} onClick={copyReport}>Copy report</Button>
      </div>
    </>
  );
}

function initialChecks(): Check[] {
  const ios = isIOS(), ver = iosVersion(), standalone = isStandalone();
  const pushApi = 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator;
  let push: [State, string];
  if (ios && ver !== null && !versionAtLeast(ver, '16.4')) push = ['bad', `iOS ${ver} is too old for alerts. Update to iOS 16.4 or newer.`];
  else if (ios && !standalone) push = ['warn', 'iPhone alerts only work in the installed app. Install it from Safari first.'];
  else if (pushApi) push = ['ok', 'Supported. You’ll switch alerts on in the lobby (Phase 5).'];
  else push = ['bad', 'This browser can’t receive push alerts.'];
  const wake = 'wakeLock' in navigator;
  const battery = 'getBattery' in navigator;
  return [
    { id: 'install', title: 'Installed to Home Screen', state: standalone ? 'ok' : 'warn', detail: standalone ? 'Running full screen as an app.' : 'Running in the browser. Install it for full screen and alerts.' },
    { id: 'offline', title: 'Works offline', state: 'wait', detail: 'Checking…' },
    { id: 'firebase', title: 'Firebase', state: 'wait', detail: 'Checking…' },
    { id: 'server', title: 'Game server & clock', state: 'wait', detail: 'Checking…' },
    { id: 'push', title: 'Push alerts', state: push[0], detail: push[1] },
    { id: 'location', title: 'Location', state: 'geolocation' in navigator ? 'wait' : 'bad', detail: 'geolocation' in navigator ? 'Tap “Test location” to check.' : 'No location support in this browser.' },
    { id: 'wake', title: 'Keep screen awake', state: wake ? 'ok' : 'warn', detail: wake ? 'Supported. The screen stays on during rounds.' : 'Not supported here. Set Auto-Lock to Never while playing.' },
    { id: 'battery', title: 'Battery level', state: battery ? 'ok' : 'warn', detail: battery ? 'Supported. Low-battery warnings will work.' : 'Not available on this phone (iPhone never shares battery level with web apps), so low-battery warnings can’t be sent from it.' },
    ...(ver !== null ? [{ id: 'ios', title: 'iOS version', state: (versionAtLeast(ver, '16.4') ? 'ok' : 'bad') as State, detail: `iOS ${ver}${versionAtLeast(ver, '16.4') ? '' : ': update to 16.4+ for alerts'}` }] : []),
  ];
}
