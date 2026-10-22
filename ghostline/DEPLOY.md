# Put GHOSTLINE online (Phase 1)

This guide takes about **30 minutes** the first time. You don't need to install anything on your computer. Everything happens in your web browser. At the end you'll have a link like `https://ghostline-abc12.web.app` that you and your friends install on your phones.

You need:
- A Google account (Gmail works).
- A credit or debit card (see step 2 for why; a friend group stays on the free allowance).
- Your iPhone, for the last step.

> **Tip:** do steps 1–7 on a laptop or desktop. The Firebase website is hard to use on a phone.

---

## 1. Create the Firebase project

1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a Firebase project** (or **Create a project**).
3. **Project name:** type `ghostline`. Firebase adds a few random letters to make it unique, for example `ghostline-abc12`. Write that full name down; it becomes your web address.
4. Tick the box to accept the terms, then click **Continue**.
5. If it offers **Gemini in Firebase**, you can leave it off. Click **Continue**.
6. **Google Analytics:** switch it **off** for now (we'll add privacy-friendly analytics in a later phase). Click **Create project**.
7. Wait about 30 seconds, then click **Continue**.

## 2. Switch to the Blaze plan (card required, still free for you)

Firebase only lets you use server timers and push alerts (Cloud Functions) on the **Blaze ("pay as you go")** plan, so you need it. Here's the deal:
- Blaze includes the same **free monthly allowance** as the free plan, and that allowance never expires. A group of friends playing a few rounds a week uses a small slice of it, so your bill should be **$0**.
- Blaze projects are **never paused or deleted for being idle**. Your app keeps working for years without you touching it.
- Google requires a card on file for Blaze. Step 3 sets up an email alert at $1 so nothing can surprise you.

1. In the Firebase console, look at the **bottom of the left sidebar**. It says **Spark** (the free plan). Click **Upgrade** next to it.
2. Choose **Blaze**, then click **Select plan** (or **Continue**).
3. If you don't already have a Google Cloud billing account, click **Create a Cloud Billing account**. Pick your country, enter your card details, and click **Confirm** (or **Submit and enable billing**).
4. If it asks you to set a budget right here, type `1` and click **Continue**. You'll do the proper alert next anyway.
5. Click **Link** (or **Purchase**) to finish. The sidebar now says **Blaze**.

## 3. Set a $1 budget alert

This emails you if the project ever costs more than $1 in a month. It's an alert only: it doesn't switch anything off.

1. Go to **https://console.cloud.google.com/billing**.
2. Click the billing account you just made (usually **My Billing Account**).
3. In the left menu, click **Budgets & alerts**.
4. Click **+ Create budget** at the top.
5. **Name:** `GHOSTLINE $1 alert`.
6. **Time range:** Monthly. **Projects:** open the dropdown, tick only your `ghostline-…` project. Leave **Services** as "All services". Click **Next**.
7. **Budget type:** Specified amount. **Target amount:** `1`. Click **Next**.
8. Under **Alert threshold rules** you'll see some rows. Make them **50%**, **90%** and **100%**, each with **Trigger on: Actual**.
9. Under **Notifications**, make sure **Email alerts to billing admins and users** is ticked.
10. Click **Finish**.

## 4. Register the web app

1. Go back to **https://console.firebase.google.com** and open your project.
2. On the project home page, click **+ Add app**, then the **web** icon: `</>`.
3. **App nickname:** `GHOSTLINE`.
4. Tick **Also set up Firebase Hosting for this app**. If a site dropdown appears, keep the suggested one.
5. Click **Register app**.
6. You'll see some code snippets. **You don't need them** (GHOSTLINE fetches these settings automatically). Click **Next**, then **Next**, then **Continue to console**.

## 5. Create the database

1. In the left sidebar, click **Build** (or **Databases & Storage**), then **Firestore Database**.
2. Click **Create database**.
3. If it asks for an edition, choose **Standard edition**. Click **Next**.
4. **Database ID:** leave it as `(default)`. **Location:** choose **nam5 (United States)** wherever you live. All the game servers run in the US, and this keeps them next to the database. Players anywhere in the world can still play. Click **Next**.
5. Choose **Start in production mode**. Click **Create**. GHOSTLINE uploads its own locked-down rules when you deploy.

## 6. Get the GHOSTLINE code

1. Go to **https://github.com/larpconu/shineydex** (sign in to GitHub if it's private).
2. Click the branch dropdown (it says **main** or similar) and pick **`claude/blissful-mccarthy-gfzt4t`**.
3. Click the green **Code** button, then **Download ZIP**. Keep the file where it lands (usually Downloads).

## 7. Deploy (one command)

We'll use **Google Cloud Shell**, a free terminal that runs in your browser.

1. Go to **https://shell.cloud.google.com**. Sign in with the **same Google account** as Firebase. If it asks you to authorize or accept terms, click **Continue** or **Authorize**.
2. Wait until you see a black terminal with a line ending in `$`.
3. Click the **⋮ (More)** button at the top right of the terminal panel, then **Upload**. Choose the ZIP from step 6, then click **Upload**.
4. Click inside the terminal. Copy the lines below, paste them (Ctrl+V, or Cmd+V on a Mac), and press **Enter**:

   ```
   unzip -oq shineydex-*.zip && cd shineydex-*/ghostline
   nvm install 22
   npm install
   npm run deploy
   ```

5. The deploy walks you through the rest:
   - **"Sign in to Firebase."** It may ask *"Allow Firebase to collect CLI usage information?"*: type `n` and press Enter. Then it shows a long link. Click it, choose your Google account, click **Allow**, copy the code it shows, paste it back into the terminal and press **Enter**.
   - **"Pick your Firebase project."** Use the arrow keys to highlight your `ghostline-…` project and press **Enter**. When it asks *"What alias do you want to use for this project?"*, type `default` and press **Enter**.
   - **"How many days do you want to keep container images before they're deleted?"**: just press **Enter**.
   - If it asks to **enable an API**, type `y` and press **Enter**.
6. After 3–6 minutes you'll see **Done! Your app: https://ghostline-abc12.web.app**. That's your link.

> If it fails, read the red message. It tells you the usual fix. The most common one: *"wait 2 minutes and run it again"*. Google is still switching things on for your new project. Type `npm run deploy` and press Enter.

## 8. Install on your iPhone and test Phase 1

1. On your iPhone, open **Safari** (it has to be Safari) and go to your link.
2. Tap the **Share** button (square with an up-arrow) → scroll down → **Add to Home Screen**. If you see **Open as Web App**, keep it on. Tap **Add**.
3. Open **GHOSTLINE from the new home-screen icon**. You should see the splash screen, then the home screen, full screen with no Safari bars.
4. Tap **Settings** (gear) → **System check**. You should see green ticks for:
   - **Installed to Home Screen**
   - **Works offline** (if it says "caching…", close the app, wait 5 seconds and open it again)
   - **Firebase** (shows your project name)
   - **Game server & clock**
   - **Push alerts** (supported; you'll switch them on in Phase 5)
   - Tap **Test location** → choose **Allow While Using App** → it should say "Got a fix".
   - **Battery level** will say *not available*. That's normal: iPhones never share battery level with web apps.
5. **Offline test:** turn on Airplane Mode, close GHOSTLINE completely (swipe it away), then open it from the icon. It should still open, with a yellow "You're offline" banner. Turn Airplane Mode off.
6. **Link test:** in Notes, type `https://YOUR-LINK.web.app/j/K7Q2FX`, tap it, and it should open GHOSTLINE's Join screen showing the code **K7Q2FX** (joining itself comes in Phase 3).

If something isn't green, tap **Copy report** at the bottom of System check and send it to me.

## 9. Share it with friends

Send your friends the link (`https://ghostline-abc12.web.app`) with this message:

> Open this in Safari on your iPhone, tap Share → Add to Home Screen, then open GHOSTLINE from the icon.

Android friends: open the link in Chrome → ⋮ menu → **Install app** (or **Add to Home screen**).

The app has its own **Install guide** (Settings → Install guide) if anyone gets stuck.

Want a nicer address like `ghostline.app`? You'd buy the domain (about $15–20 a year) and connect it in Firebase → Hosting → **Add custom domain**. We'll do that in the growth phase. Your `web.app` link keeps working either way.

## Updating later

When I send you a new version: download the new ZIP (step 6), upload it to Cloud Shell (step 7.3), then run:

```
cd ~ && rm -rf shineydex-*/ && unzip -oq shineydex-*.zip && cd shineydex-*/ghostline && npm install && npm run deploy
```

> If you have several ZIPs in Cloud Shell, delete the old ones first: `rm ~/shineydex-*.zip`, then upload the new one.

Phones update themselves the next time GHOSTLINE is opened.

## What it costs

| Thing | Free allowance (every month, forever) | A friend group uses |
|---|---|---|
| Hosting | 10 GB stored, 360 MB downloaded per day | about 1 MB per phone install |
| Firestore | 50,000 reads, 20,000 writes, 20,000 deletes per day | a few thousand per game |
| Cloud Functions | 2 million calls, 400,000 GB-seconds | a few hundred per game |
| Cloud Tasks (game timers) | 1 million operations | a few dozen per game |
| Cloud Messaging (push) | unlimited, free | |
| Artifact Registry (stores the server code) | 0.5 GB | about 0.1–0.3 GB, thanks to the 1-day cleanup you accepted in step 7 |

Google bills you only for usage **above** these allowances. Your $1 alert from step 3 emails you long before that matters.
