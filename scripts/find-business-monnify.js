const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, email, plan, payment_provider')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
