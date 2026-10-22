// Firebase setup. On Firebase Hosting the web config is served automatically at
// /__/firebase/init.json, so there's nothing to paste. For local development, put the
// values in .env.local (see .env.example).
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';

let appPromise: Promise<FirebaseApp | null> | null = null;

function envConfig(): FirebaseOptions | null {
  const e = import.meta.env;
  if (!e.VITE_FIREBASE_API_KEY) return null;
  return {
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    appId: e.VITE_FIREBASE_APP_ID,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
  };
}

export async function loadFirebaseConfig(): Promise<FirebaseOptions | null> {
  const fromEnv = envConfig();
  if (fromEnv) return fromEnv;
  try {
    const r = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const cfg = (await r.json()) as FirebaseOptions;
    try { localStorage.setItem('gl.firebase', JSON.stringify(cfg)); } catch { /* private mode */ }
    return cfg;
  } catch {
    try { return JSON.parse(localStorage.getItem('gl.firebase') ?? 'null') as FirebaseOptions | null; } catch { return null; }
  }
}

/** The Firebase app, or null if this copy isn't connected to a Firebase project yet. */
export function getFirebaseApp(): Promise<FirebaseApp | null> {
  appPromise ??= loadFirebaseConfig().then((cfg) => (cfg?.projectId ? initializeApp(cfg) : null));
  return appPromise;
}
