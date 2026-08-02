/**
 * Full Monnify Scale upgrade simulation via local API.
 */
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const API = process.env.E2E_API_URL || 'http://localhost:3001';
const BUSINESS_ID = 'a0000000-0000-4000-8000-0000000000a1';
const SECRET = process.env.BUSINESS_JWT_SECRET || process.env.JWT_SECRET;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function token() {
  return jwt.sign({ sub: BUSINESS_ID }, SECRET, { expiresIn: '1h' });
}

async function main() {
  // Downgrade so upgrade to scale is allowed
  await supabase.from('businesses').update({ plan: 'growth', payment_provider: 'monnify' }).eq('id', BUSINESS_ID);

  const t = token();
  const initRes = await fetch(`${API}/api/subscription/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      businessId: BUSINESS_ID,
      plan: 'scale',
      email: 'demo@zuri.com',
      callbackUrl: 'http://localhost:5173/upgrade-done',
      interval: 'monthly'
    })
  });
  const init = await initRes.json();
  console.log('initialize status:', initRes.status);
  console.log(JSON.stringify(init, null, 2));
  if (!init.checkoutUrl) process.exit(1);
  console.log('\nCHECKOUT_URL=' + init.checkoutUrl);
}

main().catch((e) => { console.error(e); process.exit(1); });
