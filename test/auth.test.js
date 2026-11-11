const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const {
  signBusinessToken,
  signScannerToken,
  requireBusinessAuth
} = require('../server/middleware/auth');
const { requireAdminAuth } = require('../server/middleware/adminAuth');
const { validateNewPassword } = require('../server/lib/passwordResetTokens');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(server, { method = 'GET', path = '/', headers = {}, body }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('password rules reject empty and short passwords', () => {
  assert.equal(validateNewPassword(''), 'Password is required');
  assert.match(validateNewPassword('short'), /at least 8/);
  assert.equal(validateNewPassword('long-enough'), null);
});

test('business routes require a business token and reject scanner sessions', async () => {
  const businessId = 'a0000000-0000-4000-8000-0000000000a1';
  const app = express();
  app.get('/api/business/private', requireBusinessAuth, (req, res) => {
    if (req.businessId !== businessId) {
      return res.status(403).json({ error: 'Wrong business' });
    }
    res.json({ businessId: req.businessId });
  });
  const server = await listen(app);
  try {
    const missing = await request(server, { path: '/api/business/private' });
    assert.equal(missing.status, 401);

    const garbage = await request(server, {
      path: '/api/business/private',
      headers: { authorization: 'Bearer not-a-token' }
    });
    assert.equal(garbage.status, 401);

    const scanner = signScannerToken(businessId, 'scan-1');
    const denied = await request(server, {
      path: '/api/business/private',
      headers: { authorization: `Bearer ${scanner}` }
    });
    assert.equal(denied.status, 403);

    const other = signBusinessToken('b0000000-0000-4000-8000-0000000000b2');
    const wrongBusiness = await request(server, {
      path: '/api/business/private',
      headers: { authorization: `Bearer ${other}` }
    });
    assert.equal(wrongBusiness.status, 403);

    const token = signBusinessToken(businessId);
    const ok = await request(server, {
      path: '/api/business/private',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.businessId, businessId);
  } finally {
    server.close();
  }
});

test('admin routes require the platform key', async () => {
  const previous = process.env.ZURI_ADMIN_API_KEY;
  const app = express();
  app.get('/api/admin/venues', requireAdminAuth, (_req, res) => {
    res.json({ ok: true });
  });
  const server = await listen(app);
  try {
    delete process.env.ZURI_ADMIN_API_KEY;
    const unconfigured = await request(server, { path: '/api/admin/venues' });
    assert.equal(unconfigured.status, 503);

    process.env.ZURI_ADMIN_API_KEY = 'portfolio-admin-key';
    const missing = await request(server, { path: '/api/admin/venues' });
    assert.equal(missing.status, 401);

    const wrong = await request(server, {
      path: '/api/admin/venues',
      headers: { 'x-zuri-admin-key': 'nope' }
    });
    assert.equal(wrong.status, 401);

    const ok = await request(server, {
      path: '/api/admin/venues',
      headers: { 'x-zuri-admin-key': 'portfolio-admin-key' }
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.ok, true);
  } finally {
    if (previous === undefined) delete process.env.ZURI_ADMIN_API_KEY;
    else process.env.ZURI_ADMIN_API_KEY = previous;
    server.close();
  }
});
