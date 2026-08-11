/**
 * Global public storefront slugs: zuriqo.com/{slug} → default storefront.
 */

const RESERVED_PUBLIC_SLUGS = new Set(
  [
    'order',
    'event',
    'business',
    'api',
    'tap',
    'scan',
    'pricing',
    'privacy',
    'demo',
    'waitlist',
    'reserve',
    'subscribe',
    'payment-done',
    'upgrade-done',
    'zuri-tap',
    'zuri',
    'zuriqo',
    'admin',
    'login',
    'logout',
    'signup',
    'register',
    'settings',
    'dashboard',
    'network',
    'assets',
    'static',
    'favicon',
    'robots',
    'sitemap',
    'health',
    'status',
    'www',
    'app',
    'cdn',
    'mail',
    'support',
    'help',
    'docs',
    'blog',
    'about',
    'contact',
    'home',
    'index',
    'null',
    'undefined',
    'main',
    'storefront',
    'shop',
    'menu',
    'ticket',
    'tickets'
  ].map((s) => s.toLowerCase())
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slugifyPublicName(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'store';
}

function normalizePublicSlug(raw) {
  const s = slugifyPublicName(raw);
  if (!s || s.length < 2) return null;
  if (RESERVED_PUBLIC_SLUGS.has(s)) return null;
  if (UUID_RE.test(s)) return null;
  if (/^\d+$/.test(s)) return null;
  return s.slice(0, 60);
}

function isReservedPublicSlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  return !s || RESERVED_PUBLIC_SLUGS.has(s) || UUID_RE.test(s);
}

/**
 * Find an available slug derived from `preferred` (or business name).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} preferred
 * @param {{ excludeBusinessId?: string }} [opts]
 */
async function allocateUniquePublicSlug(supabase, preferred, opts = {}) {
  const base = normalizePublicSlug(preferred) || 'store';
  const excludeId = opts.excludeBusinessId ? String(opts.excludeBusinessId) : null;

  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base.slice(0, 48)}-${i + 1}`.slice(0, 60);
    if (isReservedPublicSlug(candidate) && i === 0) continue;

    let q = supabase.from('businesses').select('id').ilike('public_slug', candidate).limit(1);
    const { data, error } = await q;
    if (error) {
      // Column may not exist yet on older envs — surface clearly.
      throw error;
    }
    const hit = (data || [])[0];
    if (!hit) return candidate;
    if (excludeId && hit.id === excludeId) return candidate;
  }

  const fallback = `${base.slice(0, 40)}-${Date.now().toString(36)}`.slice(0, 60);
  return fallback;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} slug
 * @param {{ excludeBusinessId?: string }} [opts]
 */
async function isPublicSlugAvailable(supabase, slug, opts = {}) {
  const normalized = normalizePublicSlug(slug);
  if (!normalized) {
    return { available: false, slug: null, reason: 'invalid_or_reserved' };
  }
  const excludeId = opts.excludeBusinessId ? String(opts.excludeBusinessId) : null;
  const { data, error } = await supabase
    .from('businesses')
    .select('id')
    .ilike('public_slug', normalized)
    .limit(1);
  if (error) throw error;
  const hit = (data || [])[0];
  if (!hit || (excludeId && hit.id === excludeId)) {
    return { available: true, slug: normalized, reason: null };
  }
  return { available: false, slug: normalized, reason: 'taken' };
}

module.exports = {
  RESERVED_PUBLIC_SLUGS,
  slugifyPublicName,
  normalizePublicSlug,
  isReservedPublicSlug,
  allocateUniquePublicSlug,
  isPublicSlugAvailable
};
