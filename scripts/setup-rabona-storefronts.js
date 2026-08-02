/**
 * Sets up Rabona Entertainment with two storefront profiles:
 * - Rabona Event
 * - Bikini Bottom Event
 *
 * Usage: node scripts/setup-rabona-storefronts.js
 * Optional: BUSINESS_ID=uuid node scripts/setup-rabona-storefronts.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const { init, getDb } = require('../server/database');
const { createDefaultStorefrontProfile, legacyColumnsFromProfiles } = require('../server/lib/storefrontProfiles');

function createRabonaEventPage(title, slug) {
  return {
    id: `evt_${slug.replace(/-/g, '_')}`,
    slug,
    title,
    subtitle: title === 'Rabona Event' ? 'The main Rabona experience' : 'Dive into Bikini Bottom vibes',
    coverImageUrl: null,
    eventStartsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    showCountdown: true,
    lineup: [
      { name: 'Headline act', role: 'Main stage' },
      { name: 'Resident DJ', role: 'Warm-up' }
    ],
    enabled: true,
    refundPolicy: 'full_before_event',
    refundPolicyText:
      'Full refund if the event is cancelled by the venue. No refunds within 24 hours of start time unless the venue agrees.',
    eventTemplate: 'nightclub'
  };
}

async function main() {
  await init();
  const supabase = getDb();
  const forcedId = String(process.env.BUSINESS_ID || '').trim();

  let business;
  if (forcedId) {
    const { data, error } = await supabase.from('businesses').select('*').eq('id', forcedId).maybeSingle();
    if (error || !data) throw new Error(`Business not found for BUSINESS_ID=${forcedId}`);
    business = data;
  } else {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .ilike('name', '%rabona%')
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      throw new Error('Rabona Entertainment business not found. Set BUSINESS_ID or create the account first.');
    }
    business = data;
  }

  const rabonaProfile = createDefaultStorefrontProfile('Rabona Event', {
    id: 'sf_rabona_event',
    slug: 'rabona-event',
    isDefault: true,
    config: business.storefront_config || {},
    details: {
      name: 'Rabona Event',
      tagline: 'Official Rabona Entertainment ticketing',
      cuisineTags: ['Live music', 'Nightlife'],
      contactPhone: business.phone || '',
      eventPages: [createRabonaEventPage('Rabona Event', 'rabona-event')]
    }
  });

  const bikiniProfile = createDefaultStorefrontProfile('Bikini Bottom Event', {
    id: 'sf_bikini_bottom',
    slug: 'bikini-bottom-event',
    isDefault: false,
    config: {
      ...(business.storefront_config || {}),
      brandColor: '#38bdf8',
      backgroundTone: 'dark',
      menuTemplate: 'premium-dark'
    },
    details: {
      name: 'Bikini Bottom Event',
      tagline: 'Under the sea — on land',
      cuisineTags: ['Festival', 'Experience'],
      contactPhone: business.phone || '',
      eventPages: [createRabonaEventPage('Bikini Bottom Event', 'bikini-bottom-event')]
    }
  });

  rabonaProfile.details.eventPages[0].storefrontId = rabonaProfile.id;
  bikiniProfile.details.eventPages[0].storefrontId = bikiniProfile.id;

  const profiles = [rabonaProfile, bikiniProfile];
  const legacy = legacyColumnsFromProfiles(profiles);

  const { error: updateError } = await supabase
    .from('businesses')
    .update({
      business_mode: 'ticketing',
      storefront_profiles: profiles,
      storefront_config: legacy.storefront_config,
      storefront_details: legacy.storefront_details
    })
    .eq('id', business.id);

  if (updateError) {
    if (/storefront_profiles/i.test(updateError.message || '')) {
      throw new Error(
        'Missing storefront_profiles column. Run supabase/migrations/025_storefront_profiles.sql first.'
      );
    }
    throw updateError;
  }

  const origin = (process.env.FRONTEND_URL || 'https://zuriqo.com').split(',')[0].replace(/\/$/, '');
  console.log('Rabona multi-storefront setup complete.');
  console.log(`Business: ${business.name} (${business.id})`);
  console.log(`Rabona Event storefront: ${origin}/order/${business.id}/rabona-event`);
  console.log(`Rabona Event tickets:    ${origin}/event/${business.id}/rabona-event`);
  console.log(`Bikini Bottom storefront: ${origin}/order/${business.id}/bikini-bottom-event`);
  console.log(`Bikini Bottom tickets:    ${origin}/event/${business.id}/bikini-bottom-event`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
