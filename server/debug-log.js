const fs = require('fs');
const path = require('path');

const LOG_PATH = path.resolve(__dirname, '..', 'debug-0133e9.log');

function agentLog(payload) {
  const line = JSON.stringify({ ...payload, timestamp: payload.timestamp || Date.now() }) + '\n';
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    try { fs.appendFileSync(path.join(process.cwd(), 'debug-0133e9.log'), line); } catch (_) {}
  }
  try {
    fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0133e9' }, body: JSON.stringify({ sessionId: '0133e9', ...payload }) }).catch(() => {});
  } catch (_) {}
}

module.exports = { agentLog, LOG_PATH };
