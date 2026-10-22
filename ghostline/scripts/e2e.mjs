// Runs the end-to-end PWA test inside the Firebase Hosting + Functions emulators.
// Everything is local, so any HTTP(S) proxy settings are dropped for the emulator process.
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
for (const k of Object.keys(env)) if (/^(https?_proxy|global_agent_https?_proxy)$/i.test(k)) delete env[k];

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npm', ['run', 'build']);
run('npm', ['--prefix', 'functions', 'run', 'build']);
run('npx', ['firebase', 'emulators:exec', '--only', 'hosting,functions', '--project', 'demo-ghostline', 'node tests/e2e/pwa.e2e.mjs'], { env });
