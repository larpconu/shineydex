# GHOSTLINE build roadmap

The master spec (plus the host-settings and growth sections sent after it) is built in phases. After each phase you get the files and a test list, and work stops until you say OK.

| # | Phase | Status |
|---|---|---|
| 1 | Project setup, deploy pipeline, PWA install on iPhone | **Done, waiting for your OK** |
| 2 | Accounts & settings | Next |
| 3 | Hosting, lobby & teams (incl. the full host-settings screen and presets) | |
| 4 | Core round: head start, location engine, pings, zone, tagging, ending, results, demo mode | |
| 5 | Radio chat & alerts | |
| 6 | Modes (Foot/Bike/Car) & optional rules (zombie, jail break, abilities, ping styles, referee) | |
| 7 | Host Pass payments (Stripe) & owner admin panel | |
| 8 | Safety, moderation & extras (history, stats, rejoin, host transfer, in-round host controls) | |
| 9 | Design polish pass | |
| 10 | Full test checklist | |
| 11 | Growth: sharing, link previews, result cards, replay video, free trial, referrals, promo codes, badges, Event Mode, landing page, Play Store package, analytics | |

## What goes in each phase

**Phase 2: Accounts & settings.** Email sign-in (see the iPhone note below), first-run name and username with live availability and a profanity filter, the product-updates opt-in, and full Settings: edit profile, per-alert toggles, sound and vibration, units, blocked players, Restore Host Pass (wired up in Phase 7), privacy/terms/help, delete account, and sign out. First-launch onboarding: 4 swipe cards, then the safety screen, then sign-in. The `users/{uid}` rules come with automated tests (for example, the client can never write `hostPass` or `role`).

**Phase 3: Hosting, lobby & teams.** The setup screen with every host setting from section 5 (A–L), collapsible groups, "?" tooltips, reset-to-default, the summary bar, built-in and saved presets. Map with search, satellite toggle, polygon zones, no-go areas, meetup and jail pins. The 6-box code entry, deep links, the invite preview, the lobby (teams, balance rules, ready, location/alert/in-zone checks, kick, lock, approve joins, edit settings, transfer host, lobby chat, report/block). The host picks a side like everyone else.

**Phase 4: Core round.** Server-authoritative timers through Cloud Tasks, the clock offset, head start (hunters see a blurred, no-peeking map), the location engine (5 s / 3 s / 3 s), team-restricted `live` documents with automated rules tests, pings into `pings/{n}` with trails, fades and accuracy, out-of-zone and no-go detection with the grace period and penalties, shrinking zone, GPS-validated tagging with the host-approval fallback, spectators, leave and rejoin, the three ways a round ends, results with stats and replay, rematch, and demo mode with street-following bots.

**Phase 5: Radio & alerts.** Team, spectator and lobby chat, quick replies, location pins, unread badges, press-and-hold report/block, the slur filter, Web Push through FCM for every alert in section 10 (each one toggleable), the permission explainer in the lobby, vibration patterns, and the silent-mode reminder.

**Phase 6: Modes & optional rules.** Foot, Bike and Car defaults and ranges, the car agreement and the simplified driving view, fuzzy and direction-only pings, ping escalation, overtime, hunter freeze, zombie mode, jail break, abilities (Ghost, Decoy, Radar, Proximity), referee host, and the tag-confirmation variants.

**Phase 7: Host Pass.** Stripe Checkout, the webhook (verified signature) that sets `users/{uid}.hostPass`, the price in `config/pricing`, Restore Purchase, the upsell sheet, and the owner admin panel (search, comp, revoke, holders and revenue, price, reports queue, ban). Includes a Stripe test-mode guide with test cards, and how to switch to live.

**Phase 8: Safety, moderation & extras.** The safety button (pause, reveal everyone, call 911, regroup), host-only resume, the low-battery warning, reports with game context, bans, auto host transfer after 2 minutes, every in-round host control (pause, ±5 min, ping now, shrink now, approve tags, un-tag, switch team, kick, transfer, end with a chosen winner) logged on the results timeline, plus History and lifetime stats.

**Phase 9: Polish.** A design pass on every screen at 393×852 and 375×667, motion, empty and error states, and contrast.

**Phase 10: Test checklist.** Every item from sections 19 and 20, plus the host-settings items, run and reported pass or fail.

**Phase 11: Growth.** Everything in section 20 (see the notes below).

## Straight answers: what an iPhone web app can't do, and what we do instead

| Spec item | Reality on iPhone | What GHOSTLINE does |
|---|---|---|
| Share location while the phone is locked or the app is closed | **Not possible** for web apps. iOS suspends them. | Wake Lock keeps the screen on, and players are told clearly to keep the app open with low brightness. Phase 4 adds a "signal lost" badge after 60 s, and phones catch up the moment the app is back in front. |
| Low-battery warning to teammates | **iPhone never tells web apps the battery level.** | Works for Android players. iPhone players get a pre-round "charge up" reminder instead. System check says this plainly. |
| Vibration patterns | iPhone Safari has **no Vibration API**. | Push alerts vibrate according to the phone's own settings, even in silent mode. In the app, iOS 18+ gets a light haptic tap on button presses (via a native-switch trick). Android gets the full patterns. |
| Email-link sign-in, links expiring after 10 min | Firebase's email link opens in **Safari**, which on iPhone keeps **separate storage** from the home-screen app, so you'd end up signed in to the wrong one. Firebase also doesn't let you set a 10-minute expiry. | **Proposed for Phase 2:** a 6-digit code emailed by our own Cloud Function. That gives the 10-minute expiry, the 30-second resend gap and the 5-per-hour limit, and you type the code into the app itself. It needs a sending service: Firebase's Trigger Email extension plus an email account's SMTP (for example a Gmail app password, free) or a transactional provider. **I'll ask you to pick one at the start of Phase 2.** |
| `ghostline.app/j/CODE` links | You'd need to buy the domain (about $15–20 a year). | Until then links are `https://<project>.web.app/j/CODE` (already working in Phase 1). Connecting a domain takes 5 clicks in Firebase Hosting. |
| Custom alert sounds / per-alert sounds | Web push on iPhone uses the system sound. | The in-app sound effects setting covers sounds while the app is open. Push alerts follow the phone's notification settings. |
| Replay MP4 export, rendered on the phone | Depends on the WebCodecs video encoder, available in recent iOS versions. | Built in Phase 11 with a feature check. Older phones fall back to sharing the animated replay as an image sequence or GIF. |
| Pull-to-refresh, text selection, tap flash | Fully controllable. | Already disabled (Phase 1). |
| Push alerts | iOS 16.4+ and **only** from the home-screen app. | System check flags old iOS versions and Safari-tab use. |

## Notes on section 20 (Growth)

- **Link previews** (iMessage, WhatsApp…) need the server to render Open Graph tags per game. That's a Cloud Function behind `/j/**` with a generated image. Planned for Phase 11.
- **Play Store** packaging (Bubblewrap/TWA) needs your $25 Google Play developer account. Phase 11 includes the step-by-step for that.
- **Analytics:** Firebase Analytics without location data, or Plausible (paid; its free plan is a time-limited trial, so it breaks the "never expires" rule unless you pay). Recommendation: Firebase Analytics, plus our own server-side event counters for the owner dashboard.
- **Event Mode** (60 players, several zones, a laptop referee dashboard) builds on the Phase 8 referee mode.

## Decisions made so far

- **Stack:** React 19 + Vite + TypeScript, and Firebase (Auth, Firestore, Cloud Functions v2, Cloud Tasks, Cloud Messaging, Hosting) on the Blaze plan, per the master spec. An earlier Supabase prototype is kept in git history only (Supabase's free tier pauses idle projects, which breaks the "works for years" rule).
- **Region:** functions in `us-central1`, database in `nam5`, for every user. Latency doesn't matter for this game, and it keeps setup to one choice.
- **No paid services needed** before Phase 7 (Stripe takes a cut per sale; nothing monthly).
