/**
 * Root postinstall: install client + server deps without relying on shell `cd`.
 * Railway / nested npm can run lifecycle scripts with cwd inside `server/`, which
 * breaks `cd client && ...`. Using explicit cwd avoids that.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const clientDir = path.join(root, 'client');
const serverDir = path.join(root, 'server');

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

try {
  if (fs.existsSync(clientDir)) {
    run('npm install --include=dev --no-audit --no-fund', clientDir);
  } else {
    console.warn('[postinstall] Skipping client: no client/ directory (server-only deploy?).');
  }

  if (fs.existsSync(serverDir)) {
    run('npm install --no-audit --no-fund', serverDir);
  } else {
    console.warn('[postinstall] Skipping server: no server/ directory.');
  }
} catch (e) {
  console.error('[postinstall] Failed:', e && e.message ? e.message : e);
  process.exit(1);
}
