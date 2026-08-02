/**
 * Optional Redis for multi-instance Socket.IO + distributed Tap locks/rate limits.
 * When REDIS_URL is unset, Postgres still backs Tap rooms/sessions; sockets stay process-local.
 */
let redis = null;
let redisReady = false;
let redisInitAttempted = false;

function getRedisUrl() {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || '';
  return String(url).trim() || null;
}

function isRedisConfigured() {
  return Boolean(getRedisUrl());
}

async function getRedis() {
  if (redisReady && redis) return redis;
  if (redisInitAttempted && !redis) return null;
  redisInitAttempted = true;

  const url = getRedisUrl();
  if (!url) return null;

  try {
    const Redis = require('ioredis');
    redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });
    redis.on('error', (err) => {
      console.error('[ZURI] Redis error:', err?.message || err);
    });
    if (redis.status !== 'ready') {
      await new Promise((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = (err) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          redis.off('ready', onReady);
          redis.off('error', onError);
        };
        redis.once('ready', onReady);
        redis.once('error', onError);
      });
    }
    redisReady = true;
    console.log('[ZURI] Redis connected (Tap multi-instance + Socket.IO adapter ready)');
    return redis;
  } catch (err) {
    console.error(
      '[ZURI] Redis unavailable — Tap state uses Postgres; sockets are single-instance until Redis is set:',
      err?.message || err
    );
    try {
      if (redis) redis.disconnect();
    } catch {
      /* ignore */
    }
    redis = null;
    redisReady = false;
    return null;
  }
}

async function redisGetJson(key) {
  const client = await getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function redisSetJson(key, value, ttlMs) {
  const client = await getRedis();
  if (!client) return false;
  try {
    const payload = JSON.stringify(value);
    if (ttlMs && ttlMs > 0) {
      await client.set(key, payload, 'PX', Math.max(1000, Math.floor(ttlMs)));
    } else {
      await client.set(key, payload);
    }
    return true;
  } catch {
    return false;
  }
}

async function redisDel(key) {
  const client = await getRedis();
  if (!client) return false;
  try {
    await client.del(key);
    return true;
  } catch {
    return false;
  }
}

async function redisIncrWindow(key, windowMs, max) {
  const client = await getRedis();
  if (!client) return null;
  try {
    const count = await client.incr(key);
    if (count === 1) await client.pexpire(key, windowMs);
    return { ok: count <= max, count };
  } catch {
    return null;
  }
}

module.exports = {
  getRedisUrl,
  isRedisConfigured,
  getRedis,
  redisGetJson,
  redisSetJson,
  redisDel,
  redisIncrWindow
};
