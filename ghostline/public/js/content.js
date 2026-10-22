// Words. Short, a little rude, all ours.
import { icon } from './ui.js';

export const TAGLINES = [
  'Hide and seek, but with satellites.',
  'Run. Hide. Get pinged anyway.',
  'Your neighborhood is the game board.',
];

export const howToPlay = () => `
  <div class="prose stack-16">
    <p>GHOSTLINE is hide and seek for grown-ups with phones and questionable cardio. Everyone plays on foot, in real life, inside a circle on the map.</p>

    <h3>The teams</h3>
    <div class="card stack-8">
      <div class="row">${icon('footprints', 'runner-i')}<b style="color:var(--runner)">Runners</b></div>
      <p>Hide inside the zone. Your teammates see you live. Hunters only get a snapshot of where you were each time a <b>ping</b> fires. So: move after every ping.</p>
    </div>
    <div class="card stack-8">
      <div class="row">${icon('crosshair')}<b style="color:var(--hunter)">Hunters</b> <span class="dim small">(you're it)</span></div>
      <p>You see your fellow hunters live, and runners only through pings. Each ping marker shows initials and how old it is, like <span class="mono">0:28 ago</span>. Chase on foot and tag people for real.</p>
    </div>

    <h3>How a round goes</h3>
    <div class="stack">
      <div class="howto-step"><span class="n">1</span><p><b>Host</b> drops the zone on the map, picks the timings and shares the 6-character code.</p></div>
      <div class="howto-step"><span class="n">2</span><p><b>Join</b> with the code. Pick Hunter, Runner or Random. Random fills whichever side is short. Everyone taps Ready.</p></div>
      <div class="howto-step"><span class="n">3</span><p><b>Head start.</b> Runners scatter. Hunters stare at a "no peeking" screen and think about their choices.</p></div>
      <div class="howto-step"><span class="n">4</span><p><b>Hunt.</b> Pings go out on a timer. Hunters chase. Runners relocate.</p></div>
      <div class="howto-step"><span class="n">5</span><p><b>Tag.</b> Touch a runner. Either the hunter taps <b>Tag</b> and picks the runner (who confirms on their phone), or the runner taps <b>I got tagged</b>. Tagged runners become spectators and can still watch their team.</p></div>
      <div class="howto-step"><span class="n">6</span><p><b>Win.</b> Hunters win if every runner is tagged before time runs out. Runners win if anyone is still free at the buzzer.</p></div>
    </div>

    <h3>Team sizes</h3>
    <p>At least 3 players. At least 1 hunter per 10 players, and never more hunters than runners. For 6 players that's 1 to 3 hunters. The lobby shows the allowed range and won't let the host start until teams work and everyone's Ready.</p>

    <h3>The zone</h3>
    <ul>
      <li>Stay inside the cyan circle.</li>
      <li>With a shrinking zone, you get a 1-minute warning and the new edge appears as a <b>dashed circle</b>.</li>
      <li>Runners outside the zone for more than <b>30 seconds</b> show up <b>live</b> on hunters' maps until they get back in. Your screen glows red and counts down first.</li>
    </ul>

    <h3>Radio</h3>
    <p>Team-only chat. Hunters can't read runner radio and vice versa. Press and hold a message to report or block the sender.</p>

    <h3>Pro tips</h3>
    <ul>
      <li>Silent mode on. A buzzing pocket is a confession.</li>
      <li>Keep GHOSTLINE open with the screen on and brightness low. iPhones stop sharing location when locked.</li>
      <li>Don't hide anywhere you wouldn't want to explain to a police officer.</li>
      <li>Play fair, stay off private property, look both ways. It's a game, not a heist.</li>
    </ul>
  </div>`;

export const privacy = () => `
  <div class="prose stack-16">
    <div class="card stack-8">
      <b>The short version</b>
      <p>We share your location with your own team during a round, and with hunters only through pings (or if you hang around outside the zone). That's it. No ads, no tracking, no selling anything.</p>
    </div>
    <h3>Location</h3>
    <ul>
      <li>Shared only from the moment a round starts until it ends, you're tagged, or you leave.</li>
      <li>Your teammates see you live. Hunters see runners only in ping snapshots, or live after 30+ seconds outside the zone. Runners never see hunters.</li>
      <li>These rules are enforced by the database itself, not just hidden in the app.</li>
      <li>Your live position is wiped when the round ends.</li>
    </ul>
    <h3>Your account</h3>
    <ul>
      <li>You sign in with a one-time code sent to your email. Other players never see your email.</li>
      <li>Other players see your display name and username in games you join.</li>
      <li>Delete your account anytime in Settings. Your name, username, email and game history go immediately.</li>
    </ul>
    <h3>Games</h3>
    <ul>
      <li>Games are private and can only be joined by code.</li>
      <li>Everything about a game (players, pings, radio messages, tags) is deleted automatically 7 days after it ends.</li>
      <li>Reports are kept for 7 days so the person running this app can look at them.</li>
    </ul>
    <h3>Who runs this</h3>
    <p>Whoever set up this copy of GHOSTLINE for your group. Data is stored with Supabase. The app is hosted on Vercel. Map tiles come from CARTO, using OpenStreetMap data.</p>
  </div>`;

export const troubleshooting = () => `
  <div class="prose stack-16">
    <div class="card stack-8" id="loc-help">
      <div class="row">${icon('locate-fixed')}<b>Location not found</b></div>
      <ol>
        <li><b>iPhone:</b> Settings → Privacy &amp; Security → Location Services → make sure it's <b>On</b>.</li>
        <li>Scroll down to <b>Safari Websites</b> (that's what home-screen apps use) → choose <b>While Using the App</b> and turn on <b>Precise Location</b>.</li>
        <li><b>Android:</b> long-press the GHOSTLINE icon → App info → Permissions → Location → <b>Allow only while using</b>, and turn on <b>Use precise location</b>.</li>
        <li>Step outside. GPS hates roofs.</li>
        <li>Turn Wi-Fi <b>on</b> (even if not connected). It helps your phone find itself faster.</li>
        <li>Close GHOSTLINE completely (swipe it away) and reopen it.</li>
        <li>Still nothing? See "Reinstall" below.</li>
      </ol>
    </div>
    <div class="card stack-8" id="push-help">
      <div class="row">${icon('bell')}<b>Alerts not arriving</b></div>
      <ol>
        <li><b>iPhone needs iOS 16.4 or newer</b> and GHOSTLINE must be opened from the <b>Home Screen icon</b>, not a Safari tab.</li>
        <li>In GHOSTLINE: Settings → <b>Alerts</b> → tap <b>Turn on alerts</b> and allow.</li>
        <li>iPhone Settings → Notifications → GHOSTLINE → <b>Allow Notifications</b> on.</li>
        <li>Focus modes (Do Not Disturb, Sleep) can hide alerts. Allow GHOSTLINE in your Focus or turn Focus off.</li>
        <li>Alerts still show on the lock screen in silent mode. Good, that's the point.</li>
        <li>Android: long-press the icon → App info → Notifications → on.</li>
        <li>If you reinstalled the app, turn alerts on again. Each install gets a fresh permission.</li>
      </ol>
    </div>
    <div class="card stack-8">
      <div class="row">${icon('moon')}<b>The app stopped sharing my location</b></div>
      <p>iPhones pause home-screen apps when the screen locks or you switch apps. Keep GHOSTLINE open, screen on, brightness low. GHOSTLINE asks the phone to stay awake during a round, but as a backup set Settings → Display &amp; Brightness → <b>Auto-Lock → Never</b> for the game and turn it back after.</p>
    </div>
    <div class="card stack-8" id="reinstall">
      <div class="row">${icon('refresh-cw')}<b>How to reinstall</b></div>
      <ol>
        <li>Press and hold the GHOSTLINE icon → <b>Remove App</b> → <b>Delete from Home Screen</b> (iPhone) or <b>Uninstall</b> (Android).</li>
        <li>Open <b>Safari</b> (iPhone) or <b>Chrome</b> (Android) and go to your group's GHOSTLINE link.</li>
        <li>iPhone: tap <b>Share</b> (the square with an arrow) → <b>Add to Home Screen</b> → <b>Add</b>. Android: tap ⋮ → <b>Install app</b>.</li>
        <li>Open it from the new icon and sign in with your email again. Your account comes back with you.</li>
        <li>Turn alerts back on in Settings.</li>
      </ol>
    </div>
    <div class="card stack-8">
      <div class="row">${icon('mail')}<b>My sign-in code never came</b></div>
      <p>Check spam. Codes can take a minute. If lots of people sign in at once, the free email service may slow down for an hour. Ask whoever set up GHOSTLINE (the setup guide has a fix).</p>
    </div>
  </div>`;

export const ONBOARDING = [
  { icon: 'ghost', title: 'Welcome to GHOSTLINE', lead: 'Real-life hide and seek. Runners hide inside a zone on the map. Hunters get pinged with where they were. Legs do the rest.' },
  {
    icon: 'smartphone', title: 'Keep it open', lead: 'iPhone web apps can’t share your location while the screen is locked. So during a round:',
    tips: [['sun-dim', 'Leave GHOSTLINE open, screen on, brightness way down.'], ['lock', 'Don’t lock your phone. We’ll try to keep the screen awake for you.'], ['zap', 'Charge up first. GPS eats battery for breakfast.']],
  },
  {
    icon: 'volume-x', title: 'Go silent', lead: 'A ping sound gives away your hiding spot. Before you play:',
    tips: [['bell-off', 'Flip the iPhone silent switch (or Action button) to silent.'], ['hand', 'Alerts still show on screen and buzz quietly.']],
  },
  { icon: 'locate-fixed', title: 'Two quick permissions', lead: 'Precise location (so the game works) and alerts (so you know when you’ve been pinged).', perms: true },
];
