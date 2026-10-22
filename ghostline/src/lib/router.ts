// A tiny router: a stack of screens with real browser history (Android back button works),
// plus deep links like /j/K7Q2FX.
import { useEffect, useState } from 'react';
import { codeFromPath } from './deeplink';

export type Route =
  | { name: 'home' }
  | { name: 'install' }
  | { name: 'system' }
  | { name: 'settings' }
  | { name: 'soon'; feature: string; phase: number }
  | { name: 'join'; code?: string };

/** Turn a URL path into a route. /j/CODE opens Join with the code filled in. */
export function parsePath(path: string): Route {
  const code = codeFromPath(path);
  return code !== null ? { name: 'join', code } : { name: 'home' };
}

type Listener = () => void;
const listeners = new Set<Listener>();
let stack: Route[] = [parsePath(window.location.pathname)];
let direction: 'fwd' | 'back' = 'fwd';

function emit() { listeners.forEach((l) => l()); }

export const nav = {
  go(route: Route) {
    stack = [...stack, route];
    direction = 'fwd';
    window.history.pushState({ depth: stack.length }, '', '/');
    emit();
  },
  replace(route: Route) {
    stack = [...stack.slice(0, -1), route];
    direction = 'fwd';
    emit();
  },
  home() {
    stack = [{ name: 'home' }];
    direction = 'back';
    window.history.replaceState({ depth: 1 }, '', '/');
    emit();
  },
  back() {
    if (stack.length <= 1) return;
    window.history.back();
  },
};

window.addEventListener('popstate', () => {
  if (stack.length > 1) { stack = stack.slice(0, -1); direction = 'back'; emit(); }
});

// Deep links land on their screen with Home underneath, so Back goes home.
if (stack[0].name !== 'home') {
  const first = stack[0];
  stack = [{ name: 'home' }];
  window.history.replaceState({ depth: 1 }, '', '/');
  queueMicrotask(() => nav.go(first));
}

export function useRoute(): { route: Route; depth: number; direction: 'fwd' | 'back' } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return { route: stack[stack.length - 1], depth: stack.length, direction };
}
