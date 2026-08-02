const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const t = jwt.sign({ sub: 'a0000000-0000-4000-8000-0000000000a1' }, process.env.JWT_SECRET, { expiresIn: '1h' });

fetch('https://zuriv5-production-e07b.up.railway.app/api/subscription/initialize', {
  method: 'POST',
  headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    businessId: 'a0000000-0000-4000-8000-0000000000a1',
    plan: 'scale',
    email: 'demo@zuri.com',
    callbackUrl: 'https://zuriqo.com/upgrade-done',
    interval: 'monthly'
  })
})
  .then(async (r) => console.log(r.status, await r.text()))
  .catch(console.error);
