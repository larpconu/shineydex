# GHOSTLINE — progress log

This file is the single place to see what's built, what's next, which accounts exist, and how to deploy. Anyone (you, me, or another AI) can pick up from here. **Never put passwords or secret keys in this file.**

_Last updated: 2026-10-22_

## Owner setup

| Question | Answer |
|---|---|
| Computer | Windows (HP laptop) |
| Test phones | iPhone only (Android gets checked in the Android emulator and with friends via Play internal testing) |
| Web address | Free Firebase address `https://<project-id>.web.app` (a custom domain can be added later) |
| Coding experience | None, so every step is written out click by click |
| Where the code lives | GitHub repo `larpconu/shineydex`, folder `ghostline/`, branch `claude/blissful-mccarthy-gfzt4t` |

## Where we are

| Stage | Status |
|---|---|
| Spec Phase 1: project setup, deploy pipeline, installable PWA | ✅ Built and tested in emulators (not yet deployed to a real Firebase project) |
| **STEP 1: set up your computer** | 🔄 **In progress.** Installing Node.js, Git, VS Code, GitHub Desktop, Firebase CLI |
| STEP 2: accounts (Firebase, Stripe) | ⏳ Next |
| Spec Phases 2–11 | ⏳ Waiting (see [docs/ROADMAP.md](docs/ROADMAP.md)) |
| Google Play release | ⏳ After the PWA works |
| Apple App Store release (Capacitor native app) | ⏳ After the PWA works |

### STEP 1 checklist
- [ ] Node.js LTS installed (`node --version`)
- [ ] Git installed (`git --version`)
- [ ] VS Code installed (`code --version`)
- [ ] GitHub Desktop installed and signed in
- [ ] Firebase CLI installed (`firebase --version`)
- [ ] Code downloaded with GitHub Desktop, branch `claude/blissful-mccarthy-gfzt4t`
- [ ] App runs on the laptop (`npm run dev` → http://localhost:5173)

## Accounts & settings created (no passwords here)

| What | Name / ID | Notes |
|---|---|---|
| GitHub | `larpconu` | Owns the `shineydex` repo |
| Firebase project | _not yet_ | Created in STEP 2 |
| Google Cloud billing account + $1 budget alert | _not yet_ | STEP 2 |
| Stripe (test mode) | _not yet_ | STEP 2 |
| Google Play Console ($25 once) | _not yet_ | STEP 5 |
| Apple Developer Program ($99/year) | _not yet_ | STEP 6 |
| Codemagic (cloud iPhone builds, since there's no Mac) | _not yet_ | STEP 6 |

## Where secrets go (never in the code, never in this file)

| Secret | Where it's stored |
|---|---|
| Firebase web config | Not secret. Served automatically by Firebase Hosting at `/__/firebase/init.json`. For running locally: `ghostline/.env.local` (copy `.env.example`). |
| Stripe secret key, webhook signing secret | Firebase "Secret Manager" (set with `firebase functions:secrets:set`, which comes in Phase 7) |
| Web Push (VAPID) key | Public half in `ghostline/.env.local` / build settings, private half held by Firebase |
| RevenueCat / Apple keys | Codemagic environment variables + Firebase Secret Manager (STEP 6) |

## How to deploy (once STEP 2 is done)

On your laptop, in VS Code's terminal, inside the `ghostline` folder:

```
npm run deploy
```

This builds the app and the server code, then uploads the website (Hosting), the server functions, the database security rules and the indexes. The first run asks you to sign in to Firebase and pick the project. See [DEPLOY.md](DEPLOY.md).

## How to test

| Command | What it checks |
|---|---|
| `npm run dev` | Runs the app on your laptop at http://localhost:5173 |
| `npm test` | Unit tests |
| `npm run test:rules` | Database security rules, in the Firebase emulator (needs Java; installed in STEP 1 later) |
| `npm run test:e2e` | Full app test in the Firebase emulators, with iPhone 15 / SE screenshots |
| `npm run test:all` | All of the above |

## Decisions log

- **2026-10-22.** Stack: React + Vite + TypeScript PWA on Firebase Blaze (master spec). An earlier Supabase prototype is kept in git history only, because Supabase's free tier pauses idle projects.
- **2026-10-22.** Firestore location `nam5`, functions `us-central1` (one region, simplest setup).
- **2026-10-22.** iPhone App Store version is wrapped with Capacitor. On Windows, iPhone builds run in the cloud with Codemagic.
- **Open question for Phase 2:** sign-in method. Firebase email links open in Safari, which on iPhone isn't the installed app (separate storage). In the native App Store app this isn't a problem (deep links open the app). For the PWA, the plan is a 6-digit email code sent by our own server, which needs an email-sending account. To be decided at the start of Phase 2.

## Monthly maintenance checklist (fill in after launch)

- [ ] Google Cloud billing: costs dashboard still ~$0? Budget alert still set?
- [ ] Stripe dashboard: payouts and disputes
- [ ] Apple Developer membership still active (renews yearly, $99)
- [ ] Google Play Console: policy emails, target API level warnings
- [ ] Domain renewal (if you buy one)
- [ ] Update dependencies (`npm outdated`, then test and deploy)
- [ ] Error reports (Crashlytics/Sentry) reviewed
