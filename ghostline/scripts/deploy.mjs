// One-command deploy: npm run deploy
// Signs you in to Firebase if needed, asks which project to use the first time,
// then builds the app and functions and deploys Hosting, Firestore rules and Functions.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const say = (m) => console.log(`\n\x1b[38;2;198;255;61m▸ ${m}\x1b[0m`);
const fail = (m) => { console.error(`\n\x1b[31m✖ ${m}\x1b[0m\n`); process.exit(1); };
const firebase = (args, opts = {}) => spawnSync('npx', ['firebase', ...args], { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
const quiet = (args) => spawnSync('npx', ['firebase', ...args], { encoding: 'utf8', shell: process.platform === 'win32' });

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19)) fail(`Node ${process.versions.node} is too old. In Cloud Shell run:  nvm install 22   then try again.`);
if (!existsSync('node_modules')) fail('Run  npm install  first (one time), then  npm run deploy  again.');

// 1. Signed in?
const who = quiet(['login:list']);
if (!/@/.test(who.stdout || '')) {
  say('Sign in to Firebase (use the Google account that owns your Firebase project).');
  const r = firebase(['login', ...(process.env.CLOUD_SHELL ? ['--no-localhost'] : [])]);
  if (r.status !== 0) fail('Sign-in didn’t finish. Run  npm run deploy  again.');
}

// 2. Which project?
if (!existsSync('.firebaserc')) {
  say('Pick your Firebase project (use the arrow keys, then Enter). When asked for an alias, type: default');
  const r = firebase(['use', '--add']);
  if (r.status !== 0 || !existsSync('.firebaserc')) fail('No project selected. Run  npm run deploy  again.');
}

// 3. Deploy (Hosting builds the app; Functions build themselves).
say('Deploying. First time takes 3–6 minutes. If it asks how many days to keep container images, just press Enter.');
const args = ['deploy', ...process.argv.slice(2)];
const r = firebase(args);
if (r.status !== 0) {
  fail('Deploy failed. The most common fixes:\n' +
    '  • “billing” or “Blaze” in the error → upgrade the project to the Blaze plan (DEPLOY.md step 2).\n' +
    '  • “API … has not been used” or “permission” → wait 2 minutes and run  npm run deploy  again.\n' +
    '  • “database does not exist” → create the Firestore database (DEPLOY.md step 5).');
}
const proj = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects?.default ?? 'YOUR-PROJECT';
say(`Done! Your app: https://${proj}.web.app   (send this link to your friends)`);
