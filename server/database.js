const { createClient } = require('@supabase/supabase-js');
const { resilientSupabaseFetch } = require('./lib/supabaseResilience');

let supabase;

function getDb() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing Supabase env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in server/.env'
      );
    }
    supabase = createClient(url, key, {
      global: {
        fetch: resilientSupabaseFetch
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        // Prefer short-lived statements; resilience layer enforces fetch timeout.
      }
    });
  }
  return supabase;
}

async function init() {
  // Important: in some deploy environments Supabase env vars may not be present
  // immediately. We don't want to crash the whole container; routes will fail
  // gracefully (and index.js returns 503) until env is configured.
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return;
    getDb();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ZURI] Supabase init skipped:', err && err.message ? err.message : String(err));
  }
}

module.exports = { getDb, init };
