const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../server/.env') });



const fs = require('fs');

const { init } = require('../server/database');

const {

  renderStorefrontHtml,

  getIndexHtmlPath,

  getApiBaseUrl,

  buildFallbackEventSeoMeta,

  injectSeoIntoHtml

} = require('../server/lib/storefrontSeo');



let dbReady = false;



async function ensureDb() {

  if (dbReady) return;

  try {

    await init();

  } catch (err) {

    console.warn('[ZURI] storefront-html db init skipped:', err && err.message ? err.message : err);

  } finally {

    dbReady = true;

  }

}



function sendFallbackHtml(res, businessId, eventSlug) {

  const html = fs.readFileSync(getIndexHtmlPath(), 'utf8');

  const slug = String(eventSlug || '').trim();

  const fallback = slug && businessId ? buildFallbackEventSeoMeta(businessId, slug) : null;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.status(200).send(fallback ? injectSeoIntoHtml(html, fallback) : html);

}



module.exports = async (req, res) => {

  const { normalizeUuid } = require('../server/lib/normalizeUuid');
  const businessId = normalizeUuid(req.query.businessId) || String(req.query.businessId || '').trim();
  const eventSlug = String(req.query.eventSlug || req.query.event || '').trim();
  const storefrontSlug = String(req.query.storefrontSlug || req.query.storefront || '').trim();

  if (!businessId) {

    res.status(400).type('text').send('Missing business id');

    return;

  }



  if (!getApiBaseUrl()) {

    console.warn(

      '[ZURI] storefront-html: set VITE_API_URL (or PUBLIC_API_URL) on Vercel so link previews can load business names.'

    );

  }



  try {

    await ensureDb();

    const html = await renderStorefrontHtml(
      businessId,
      eventSlug || undefined,
      storefrontSlug || undefined
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

    res.status(200).send(html);

  } catch (err) {

    console.error('[ZURI] api/storefront-html error:', err);

    try {

      sendFallbackHtml(res, businessId, eventSlug);

    } catch (fallbackErr) {

      console.error('[ZURI] api/storefront-html fallback error:', fallbackErr);

      res.status(500).type('text').send('Could not load storefront page');

    }

  }

};

