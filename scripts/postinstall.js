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

// Use npm install (not ci) so deploy succeeds when lockfiles drift; --ignore-scripts
// prevents nested installs from re-invoking this postinstall with the wrong cwd.
function nestedInstallCmd(includeDev) {
  return `npm install${includeDev ? ' --include=dev' : ' --omit=dev'} --no-audit --no-fund --ignore-scripts`;
}

try {
  if (fs.existsSync(clientDir)) {
    run(nestedInstallCmd(true), clientDir);
  } else {
    console.warn('[postinstall] Skipping client: no client/ directory (server-only deploy?).');
  }

  if (fs.existsSync(serverDir)) {
    run(nestedInstallCmd(false), serverDir);
  } else {
    console.warn('[postinstall] Skipping server: no server/ directory.');
  }
} catch (e) {
  console.error('[postinstall] Failed:', e && e.message ? e.message : e);
  process.exit(1);
}
