const fs = require('fs');
const path = require('path');
const { getDb } = require('../database');
const {
  normalizeStorefrontProfiles,
  findProfileBySlugOrId,
  findProfileForEvent,
  getDefaultProfile
} = require('./storefrontProfiles');
const { normalizeUuid } = require('./normalizeUuid');

const DEFAULT_SITE_URL = 'https://zuriqo.com';
const DEFAULT_OG_IMAGE = `${DEFAULT_SITE_URL}/ZURI.png`;

function getSiteUrl() {
  const raw = process.env.FRONTEND_URL || process.env.SITE_URL || '';
  const first = String(raw)
    .split(',')
    .map((part) => part.trim().replace(/\/$/, ''))
    .filter(Boolean)[0];
  return first || DEFAULT_SITE_URL;
}

function getApiBaseUrl() {
  const raw =
    process.env.VITE_API_URL ||
    process.env.PUBLIC_API_URL ||
    process.env.API_URL ||
    '';
  const normalized = String(raw)
    .trim()
    .replace(/\/$/, '')
    .replace(/\/api$/i, '');
  return normalized || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absoluteAssetUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  const base = getSiteUrl();
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

function getIndexHtmlPath() {
  const candidates = [
    path.join(process.cwd(), 'index.html'),
    path.join(process.cwd(), 'client/dist/index.html'),
    path.join(__dirname, '../../client/dist/index.html'),
    path.join(__dirname, '../client/dist/index.html')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[1];
}

function readIndexHtmlTemplate() {
  return fs.readFileSync(getIndexHtmlPath(), 'utf8');
}

function normalizeBusinessRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id,
    name: raw.name,
    logo_url: raw.logo_url ?? raw.logoUrl ?? null,
    business_mode: raw.business_mode ?? raw.businessMode ?? 'menu',
    public_slug: raw.public_slug ?? raw.publicSlug ?? null,
    storefront_config: raw.storefront_config ?? raw.storefrontConfig ?? {},
    storefront_details: raw.storefront_details ?? raw.storefrontDetails ?? {},
    storefront_profiles: raw.storefront_profiles ?? raw.storefrontProfiles ?? null
  };
}

function resolveActiveProfile(business, opts = {}) {
  const profiles = normalizeStorefrontProfiles(business);
  const eventSlug = String(opts.eventSlug || '').trim();
  const storefrontSlug = String(opts.storefrontSlug || '').trim();
  if (eventSlug) {
    const hit = findProfileForEvent(profiles, eventSlug);
    if (hit) return hit.profile;
  }
  return findProfileBySlugOrId(profiles, storefrontSlug) || getDefaultProfile(profiles);
}

function formatZuriPageTitle(name) {
  const label = String(name || '').trim() || 'Storefront';
  return `ZURI | ${label}`;
}

function formatZuriEventTitle(eventTitle, businessName) {
  const event = String(eventTitle || '').trim() || 'Event';
  const business = String(businessName || '').trim() || 'Venue';
  return `Buy ${event} by ${business} on Zuri`;
}

function findEventPageInDetails(storefrontDetails, eventSlug, business) {
  const profiles = business ? normalizeStorefrontProfiles(business) : null;
  if (profiles) {
    const hit = findProfileForEvent(profiles, eventSlug);
    if (hit) return hit.event;
  }
  const pages = Array.isArray(storefrontDetails?.eventPages) ? storefrontDetails.eventPages : [];
  const norm = String(eventSlug || '').trim().toLowerCase();
  if (!norm) return null;
  return (
    pages.find(
      (p) => p && p.enabled !== false && String(p.slug || '').trim().toLowerCase() === norm
    ) || null
  );
}

function eventCoverImageUrl(event) {
  if (!event || typeof event !== 'object') return null;
  const raw =
    event.coverImageUrl ??
    event.cover_image_url ??
    event.coverUrl ??
    event.cover_url ??
    null;
  return absoluteAssetUrl(raw);
}

function buildStorefrontSeoMeta(business, businessId, storefrontSlug) {
  const activeProfile = resolveActiveProfile(business, { storefrontSlug });
  const storefrontDetails =
    activeProfile?.details && typeof activeProfile.details === 'object'
      ? activeProfile.details
      : business.storefront_details && typeof business.storefront_details === 'object'
        ? business.storefront_details
        : {};
  const storefrontConfig =
    activeProfile?.config && typeof activeProfile.config === 'object'
      ? activeProfile.config
      : business.storefront_config && typeof business.storefront_config === 'object'
        ? business.storefront_config
        : {};

  const storefrontName =
    String(storefrontDetails.name || '').trim() ||
    String(activeProfile?.name || '').trim() ||
    String(business.name || '').trim() ||
    'Storefront';
  const isTicketing = business.business_mode === 'ticketing';
  const slug = String(activeProfile?.slug || '').trim();
  const isDefaultSlug = !slug || slug === 'main';
  const publicSlug = String(business.public_slug || business.publicSlug || '').trim();
  const canonicalPath =
    publicSlug && isDefaultSlug
      ? `/${encodeURIComponent(publicSlug)}`
      : isDefaultSlug
        ? `/order/${encodeURIComponent(businessId)}`
        : `/order/${encodeURIComponent(businessId)}/${encodeURIComponent(slug)}`;
  const canonicalUrl = `${getSiteUrl()}${canonicalPath}`;
  const image =
    absoluteAssetUrl(storefrontConfig.heroBannerUrl) ||
    absoluteAssetUrl(business.logo_url) ||
    DEFAULT_OG_IMAGE;

  return {
    title: formatZuriPageTitle(storefrontName),
    description: `${storefrontName} on ZURI. Browse ${isTicketing ? 'tickets' : 'the menu'} and place your order online.`,
    canonicalUrl,
    image,
    imageAlt: storefrontName
  };
}

function humanizeEventSlug(slug) {
  return (
    String(slug || '')
      .trim()
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Event'
  );
}

function buildFallbackEventSeoMeta(businessId, eventSlug) {
  const slug = String(eventSlug || '').trim();
  if (!slug) return null;
  const eventName = humanizeEventSlug(slug);
  const title = formatZuriEventTitle(eventName, 'Venue');
  const canonicalPath = `/event/${encodeURIComponent(businessId)}/${encodeURIComponent(slug)}`;
  return {
    title,
    description: title,
    canonicalUrl: `${getSiteUrl()}${canonicalPath}`,
    image: DEFAULT_OG_IMAGE,
    imageAlt: eventName
  };
}

function buildEventSeoMeta(business, businessId, eventSlug) {
  const hit = findProfileForEvent(normalizeStorefrontProfiles(business), eventSlug);
  const activeProfile = hit?.profile || resolveActiveProfile(business, { eventSlug });
  const storefrontDetails =
    activeProfile?.details && typeof activeProfile.details === 'object'
      ? activeProfile.details
      : business.storefront_details && typeof business.storefront_details === 'object'
        ? business.storefront_details
        : {};
  const storefrontConfig =
    activeProfile?.config && typeof activeProfile.config === 'object'
      ? activeProfile.config
      : business.storefront_config && typeof business.storefront_config === 'object'
        ? business.storefront_config
        : {};

  const event = hit?.event || findEventPageInDetails(storefrontDetails, eventSlug, business);
  const storefrontName =
    String(storefrontDetails.name || '').trim() ||
    String(business.name || '').trim() ||
    'Storefront';
  const eventTitle = String(event?.title || '').trim() || 'Event';
  const shareTitle = formatZuriEventTitle(eventTitle, storefrontName);
  const canonicalPath = `/event/${encodeURIComponent(businessId)}/${encodeURIComponent(String(eventSlug || '').trim())}`;
  const canonicalUrl = `${getSiteUrl()}${canonicalPath}`;
  const image =
    eventCoverImageUrl(event) ||
    absoluteAssetUrl(storefrontConfig.heroBannerUrl) ||
    absoluteAssetUrl(business.logo_url) ||
    DEFAULT_OG_IMAGE;

  return {
    title: shareTitle,
    description: event?.subtitle
      ? `${event.subtitle} — ${shareTitle}`
      : shareTitle,
    canonicalUrl,
    image,
    imageAlt: eventTitle
  };
}

async function loadStorefrontSeoMetaFromDb(businessId, eventSlug, storefrontSlug) {
  const normalized = normalizeUuid(businessId) || String(businessId || '').trim();
  if (!normalized) return null;

  let supabase;
  try {
    supabase = getDb();
  } catch {
    return null;
  }

  let business;
  let error;

  ({ data: business, error } = await supabase
    .from('businesses')
    .select('id, name, logo_url, business_mode, storefront_config, storefront_details, storefront_profiles, public_slug')
    .eq('id', normalized)
    .maybeSingle());

  if (error && /storefront_profiles|business_mode|public_slug/i.test(error.message || '')) {
    ({ data: business, error } = await supabase
      .from('businesses')
      .select('id, name, logo_url, storefront_config, storefront_details')
      .eq('id', normalized)
      .maybeSingle());
  }

  if (error || !business) return null;
  const slug = String(eventSlug || '').trim();
  if (slug) return buildEventSeoMeta(business, normalized, slug);
  return buildStorefrontSeoMeta(business, normalized, storefrontSlug);
}

async function loadStorefrontSeoMetaFromApi(businessId, eventSlug, storefrontSlug) {
  const normalized = normalizeUuid(businessId) || String(businessId || '').trim();
  const apiBase = getApiBaseUrl();
  if (!normalized || !apiBase) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;

  try {
    const params = new URLSearchParams();
    const ev = String(eventSlug || '').trim();
    const sf = String(storefrontSlug || '').trim();
    if (ev) params.set('event', ev);
    if (sf) params.set('storefront', sf);
    const qs = params.toString();
    const res = await fetch(
      `${apiBase}/api/qr/business/${encodeURIComponent(normalized)}${qs ? `?${qs}` : ''}`,
      controller ? { signal: controller.signal } : undefined
    );
    if (!res.ok) return null;
    const payload = await res.json();
    const business = normalizeBusinessRecord(payload);
    if (!business) return null;
    const slug = String(eventSlug || '').trim();
    if (slug) return buildEventSeoMeta(business, normalized, slug);
    return buildStorefrontSeoMeta(business, normalized, storefrontSlug);
  } catch (err) {
    console.warn('[ZURI] storefront SEO API fallback failed:', err && err.message ? err.message : err);
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function loadStorefrontSeoMeta(businessId, eventSlug, storefrontSlug) {
  const fromDb = await loadStorefrontSeoMetaFromDb(businessId, eventSlug, storefrontSlug);
  if (fromDb) return fromDb;
  return loadStorefrontSeoMetaFromApi(businessId, eventSlug, storefrontSlug);
}

function upsertMetaTag(html, { attr, key, content }) {
  const safe = escapeHtml(content);
  const tag =
    attr === 'property'
      ? `<meta property="${key}" content="${safe}" />`
      : `<meta name="${key}" content="${safe}" />`;
  const pattern =
    attr === 'property'
      ? new RegExp(`<meta\\s+property=["']${key}["'][^>]*>`, 'i')
      : new RegExp(`<meta\\s+name=["']${key}["'][^>]*>`, 'i');
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function injectSeoIntoHtml(html, meta) {
  const title = meta.title;
  const description = meta.description;
  const canonicalUrl = meta.canonicalUrl;
  const image = meta.image;
  const imageAlt = meta.imageAlt || title;

  let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
  );

  out = upsertMetaTag(out, { attr: 'name', key: 'description', content: description });
  out = upsertMetaTag(out, { attr: 'property', key: 'og:site_name', content: 'ZURI' });
  out = upsertMetaTag(out, { attr: 'property', key: 'og:title', content: title });
  out = upsertMetaTag(out, { attr: 'property', key: 'og:description', content: description });
  out = upsertMetaTag(out, { attr: 'property', key: 'og:type', content: 'website' });
  out = upsertMetaTag(out, { attr: 'property', key: 'og:url', content: canonicalUrl });
  out = upsertMetaTag(out, { attr: 'property', key: 'og:image', content: image });
  out = upsertMetaTag(out, { attr: 'property', key: 'og:image:alt', content: imageAlt });
  if (/^https:\/\//i.test(image)) {
    out = upsertMetaTag(out, { attr: 'property', key: 'og:image:secure_url', content: image });
  }
  out = upsertMetaTag(out, { attr: 'name', key: 'twitter:card', content: 'summary_large_image' });
  out = upsertMetaTag(out, { attr: 'name', key: 'twitter:title', content: title });
  out = upsertMetaTag(out, { attr: 'name', key: 'twitter:description', content: description });
  out = upsertMetaTag(out, { attr: 'name', key: 'twitter:image', content: image });
  out = upsertMetaTag(out, { attr: 'name', key: 'twitter:image:alt', content: imageAlt });

  return out;
}

async function renderStorefrontHtml(businessId, eventSlug, storefrontSlug) {
  const html = readIndexHtmlTemplate();
  const meta = await loadStorefrontSeoMeta(businessId, eventSlug, storefrontSlug);
  if (meta) return injectSeoIntoHtml(html, meta);
  const slug = String(eventSlug || '').trim();
  if (slug) {
    const fallback = buildFallbackEventSeoMeta(businessId, slug);
    if (fallback) return injectSeoIntoHtml(html, fallback);
  }
  return html;
}

const STOREFRONT_HTML_CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=120';

async function serveStorefrontHtml(req, res) {
  let businessId = normalizeUuid(req.params?.businessId) || String(req.params?.businessId || '').trim();
  const eventSlug = String(req.params?.eventSlug || req.query?.eventSlug || req.query?.event || '').trim();
  const storefrontSlug = String(req.params?.storefrontSlug || req.query?.storefrontSlug || req.query?.storefront || '').trim();
  const publicSlug = String(req.params?.publicSlug || req.query?.publicSlug || '').trim();

  if (!businessId && publicSlug) {
    try {
      const { normalizePublicSlug } = require('./publicSlug');
      const normalized = normalizePublicSlug(publicSlug);
      if (normalized) {
        const supabase = getDb();
        const { data } = await supabase
          .from('businesses')
          .select('id')
          .ilike('public_slug', normalized)
          .maybeSingle();
        if (data?.id) businessId = data.id;
      }
    } catch (err) {
      console.warn('[ZURI] public slug SEO resolve failed:', err?.message || err);
    }
  }

  if (!businessId) {
    res.status(400).type('text').send('Missing business id');
    return true;
  }

  try {
    const html = await renderStorefrontHtml(businessId, eventSlug || undefined, storefrontSlug || undefined);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', STOREFRONT_HTML_CACHE_CONTROL);
    res.send(html);
    return true;
  } catch (err) {
    console.error('[ZURI] storefront SEO HTML error:', err);
    try {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', STOREFRONT_HTML_CACHE_CONTROL);
      const html = readIndexHtmlTemplate();
      const slug = String(req.params?.eventSlug || req.query?.eventSlug || '').trim();
      const fallback = slug ? buildFallbackEventSeoMeta(businessId, slug) : null;
      res.send(fallback ? injectSeoIntoHtml(html, fallback) : html);
      return true;
    } catch (fallbackErr) {
      console.error('[ZURI] storefront SEO fallback error:', fallbackErr);
      return false;
    }
  }
}

module.exports = {
  absoluteAssetUrl,
  buildStorefrontSeoMeta,
  buildEventSeoMeta,
  buildFallbackEventSeoMeta,
  formatZuriPageTitle,
  formatZuriEventTitle,
  getApiBaseUrl,
  getIndexHtmlPath,
  getSiteUrl,
  injectSeoIntoHtml,
  loadStorefrontSeoMeta,
  loadStorefrontSeoMetaFromApi,
  loadStorefrontSeoMetaFromDb,
  normalizeBusinessRecord,
  renderStorefrontHtml,
  serveStorefrontHtml
};
