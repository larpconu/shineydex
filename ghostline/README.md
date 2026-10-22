# GHOSTLINE

Real-life multiplayer hide and seek. Runners hide inside a zone on the map, hunters get "pings" showing where the runners were, and everyone plays on foot (or by bike or car) in the real world. The app is the referee.

- **Put it online:** [DEPLOY.md](DEPLOY.md). Step by step, no coding needed.
- **What's built and what's next:** [docs/ROADMAP.md](docs/ROADMAP.md)
- **Screenshots (iPhone 15 and iPhone SE):** [docs/screens](docs/screens)
- **Logo & icons:** [brand](brand) (SVG + PNG exports, one-colour version, wordmark)

## Tech

- React 19 + Vite + TypeScript, an installable PWA (custom service worker in `src/sw.ts`, manifest in `public/manifest.json`, iOS splash screens)
- Firebase on the Blaze plan: Hosting, Firestore (locked-down rules in `firestore.rules`), Cloud Functions v2 (`functions/`), and later Auth, Cloud Tasks and Cloud Messaging
- Self-hosted fonts (Space Grotesk, Inter, JetBrains Mono), Lucide icons

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install everything (one time) |
| `npm run dev` | Run the app locally at http://localhost:5173 |
| `npm run deploy` | Build and deploy everything to Firebase (signs you in and picks the project the first time) |
| `npm test` | Unit tests |
| `npm run test:rules` | Firestore security-rules tests (starts the Firestore emulator; needs Java) |
| `npm run test:e2e` | End-to-end PWA test in the Hosting + Functions emulators, with iPhone 15 / SE screenshots to `docs/screens` |
| `npm run test:all` | Typecheck + all of the above |
| `npm run brand` | Regenerate the logo, icons and splash screens from `scripts/brand.mjs` |

## Layout

```
src/
  main.tsx, App.tsx      app entry + screen switch
  sw.ts                  service worker (offline shell, map tile cache, push)
  lib/                   router, deep links, server clock, Firebase config, PWA helpers, haptics
  components/            Button, TopBar, Sheet, RadarBackground, OfflineBanner
  screens/               Home, InstallGuide, SystemCheck, Settings, ComingSoon
  styles/                design tokens + base styles
public/                  manifest.json, offline.html, icons, splash screens
functions/src/           Cloud Functions (Phase 1: /api/health with server time)
firestore.rules          security rules (Phase 1: everything denied)
tests/                   unit, rules (emulator), e2e (Playwright + emulators)
scripts/                 deploy.mjs, e2e.mjs, brand.mjs
brand/                   logo source files and exports
```
