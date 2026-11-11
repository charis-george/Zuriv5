/**
 * Claude-powered storefront design generation from a natural-language prompt
 * and optional reference images.
 */

const FONT_PAIRINGS = new Set(['modern', 'artisanal', 'luxe', 'playful', 'classic', 'nightlife']);
const BACKGROUND_TONES = new Set(['light', 'warm', 'dark']);
const HERO_OVERLAYS = new Set(['gradient', 'solid', 'dim', 'split']);
const GRID_STYLES = new Set(['two_col', 'row_list', 'wide_cards']);
const CARD_LAYOUTS = new Set(['stacked', 'horizontal']);
const LAYOUTS = new Set(['grid', 'list', 'cards']);
const IMAGE_SHAPES = new Set(['square', 'rounded', 'circle']);
const DIVIDER_STYLES = new Set(['none', 'soft', 'bold', 'dotted']);
const PILL_SHAPES = new Set(['pill', 'rectangle', 'underline']);
const SECTION_TITLES = new Set(['underlined', 'uppercase', 'chip']);
const SHADOW_DEPTHS = new Set(['flat', 'soft', 'deep']);

const DEFAULT_CONFIG = {
  brandColor: '#f97316',
  backgroundTone: 'light',
  heroOverlay: 'gradient',
  priceTextColor: '#f97316',
  fontFamily: 'modern',
  titleSize: 32,
  menuItemFontScale: 1,
  menuTemplate: 'custom',
  layout: 'cards',
  gridStyle: 'wide_cards',
  cardLayout: 'stacked',
  showPhotos: true,
  showDescriptions: true,
  showCalories: false,
  showRatings: false,
  cardSize: 1,
  cardImageShape: 'rounded',
  cardGap: 14,
  cardRadius: 18,
  dividerStyle: 'soft',
  pillShape: 'pill',
  sectionTitleTreatment: 'underlined',
  shadowDepth: 'soft',
  categoryStripBorder: true,
  heroHeight: 220
};

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clamp(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function pickEnum(value, allowed, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return allowed.has(v) ? v : fallback;
}

function normalizeHex(value, fallback) {
  const s = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return fallback;
}

function normalizeStorefrontConfig(raw, currentConfig = {}) {
  const base = { ...DEFAULT_CONFIG, ...(currentConfig && typeof currentConfig === 'object' ? currentConfig : {}) };
  const c = raw && typeof raw === 'object' ? raw : {};
  const merged = {
    ...base,
    brandColor: normalizeHex(c.brandColor, base.brandColor),
    priceTextColor: normalizeHex(c.priceTextColor, normalizeHex(c.brandColor, base.priceTextColor)),
    backgroundTone: pickEnum(c.backgroundTone, BACKGROUND_TONES, base.backgroundTone),
    heroOverlay: pickEnum(c.heroOverlay, HERO_OVERLAYS, base.heroOverlay),
    fontFamily: pickEnum(c.fontFamily, FONT_PAIRINGS, base.fontFamily),
    layout: pickEnum(c.layout, LAYOUTS, base.layout),
    gridStyle: pickEnum(c.gridStyle, GRID_STYLES, base.gridStyle),
    cardLayout: pickEnum(c.cardLayout, CARD_LAYOUTS, base.cardLayout),
    cardImageShape: pickEnum(c.cardImageShape, IMAGE_SHAPES, base.cardImageShape),
    dividerStyle: pickEnum(c.dividerStyle, DIVIDER_STYLES, base.dividerStyle),
    pillShape: pickEnum(c.pillShape, PILL_SHAPES, base.pillShape),
    sectionTitleTreatment: pickEnum(c.sectionTitleTreatment, SECTION_TITLES, base.sectionTitleTreatment),
    shadowDepth: pickEnum(c.shadowDepth, SHADOW_DEPTHS, base.shadowDepth),
    titleSize: Math.round(clamp(c.titleSize, 24, 48, base.titleSize)),
    menuItemFontScale: clamp(c.menuItemFontScale, 0.9, 1.2, base.menuItemFontScale),
    cardSize: clamp(c.cardSize, 0.85, 1.15, base.cardSize),
    cardGap: Math.round(clamp(c.cardGap, 8, 24, base.cardGap)),
    cardRadius: Math.round(clamp(c.cardRadius, 8, 28, base.cardRadius)),
    heroHeight: Math.round(clamp(c.heroHeight, 160, 320, base.heroHeight)),
    showPhotos: c.showPhotos !== false,
    showDescriptions: c.showDescriptions !== false,
    showCalories: c.showCalories === true,
    showRatings: c.showRatings === true,
    categoryStripBorder: c.categoryStripBorder !== false,
    menuTemplate: 'custom'
  };
  if (currentConfig?.heroBannerUrl) merged.heroBannerUrl = currentConfig.heroBannerUrl;
  if (currentConfig?.aiGuest) merged.aiGuest = currentConfig.aiGuest;
  return merged;
}

function normalizeStorefrontDetails(raw, businessName, currentDetails = {}) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const tags = Array.isArray(d.cuisineTags)
    ? d.cuisineTags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8)
    : Array.isArray(currentDetails.cuisineTags)
      ? currentDetails.cuisineTags
      : [];
  return {
    name: String(d.name || currentDetails.name || businessName || 'Your store').trim().slice(0, 80),
    tagline: String(d.tagline || currentDetails.tagline || '').trim().slice(0, 160),
    cuisineTags: tags.length ? tags : ['Signature', 'Curated'],
    contactPhone: currentDetails.contactPhone,
    instagramHandle: currentDetails.instagramHandle,
    whatsappNumber: currentDetails.whatsappNumber,
    eventPages: currentDetails.eventPages
  };
}

function visionMediaType(mimetype) {
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/gif') return 'image/gif';
  if (mimetype === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function buildStorefrontPrompt({ prompt, businessName, businessMode, currentConfig, currentDetails }) {
  return [
    'You are a senior brand and UI designer for ZURI, a hospitality storefront platform.',
    'Given the owner\'s design brief (and optional reference images), output a JSON object that restyles their public storefront.',
    'Respect the brief closely: colors, mood, typography feel, layout density, and venue type.',
    businessMode === 'ticketing'
      ? 'This venue sells event tickets — favor bold hero areas, nightlife/event aesthetics when appropriate.'
      : businessMode === 'shop'
        ? 'This venue sells products from a catalog — favor clean product browsing, retail clarity, and scannable grids.'
        : 'This venue sells food/menu items — favor appetizing, readable menu layouts.',
    '',
    `Business name: ${businessName || 'Unknown'}`,
    `Owner brief: ${String(prompt || '').trim()}`,
    currentConfig && Object.keys(currentConfig).length
      ? `Current config (refine, do not ignore entirely unless brief says so):\n${JSON.stringify(currentConfig, null, 2)}`
      : '',
    currentDetails && Object.keys(currentDetails).length
      ? `Current storefront copy:\n${JSON.stringify({ name: currentDetails.name, tagline: currentDetails.tagline, cuisineTags: currentDetails.cuisineTags }, null, 2)}`
      : '',
    '',
    'Return ONLY valid JSON with this shape:',
    '{',
    '  "storefrontConfig": {',
    '    "brandColor": "#hex",',
    '    "priceTextColor": "#hex",',
    '    "backgroundTone": "light|warm|dark",',
    '    "heroOverlay": "gradient|solid|dim|split",',
    '    "fontFamily": "modern|artisanal|luxe|playful|classic|nightlife",',
    '    "layout": "grid|list|cards",',
    '    "gridStyle": "two_col|row_list|wide_cards",',
    '    "cardLayout": "stacked|horizontal",',
    '    "showPhotos": true,',
    '    "showDescriptions": true,',
    '    "showCalories": false,',
    '    "showRatings": false,',
    '    "cardSize": 1,',
    '    "cardImageShape": "square|rounded|circle",',
    '    "cardGap": 14,',
    '    "cardRadius": 18,',
    '    "dividerStyle": "none|soft|bold|dotted",',
    '    "pillShape": "pill|rectangle|underline",',
    '    "sectionTitleTreatment": "underlined|uppercase|chip",',
    '    "shadowDepth": "flat|soft|deep",',
    '    "categoryStripBorder": true,',
    '    "heroHeight": 220,',
    '    "titleSize": 32,',
    '    "menuItemFontScale": 1',
    '  },',
    '  "storefrontDetails": {',
    '    "name": "string",',
    '    "tagline": "string",',
    '    "cuisineTags": ["up to 8 short labels"]',
    '  },',
    '  "reasoning": "1-2 sentences explaining your design choices"',
    '}'
  ]
    .filter(Boolean)
    .join('\n');
}

async function generateStorefrontWithClaude({
  prompt,
  businessName,
  businessMode,
  currentConfig,
  currentDetails,
  referenceImages = []
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('Anthropic AI not configured (missing ANTHROPIC_API_KEY).');
    err.status = 503;
    throw err;
  }

  const anthropic = new (require('@anthropic-ai/sdk'))({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
  const textPrompt = buildStorefrontPrompt({
    prompt,
    businessName,
    businessMode,
    currentConfig,
    currentDetails
  });

  const content = [{ type: 'text', text: textPrompt }];
  for (const file of referenceImages.slice(0, 3)) {
    if (!file?.buffer?.length) continue;
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: visionMediaType(file.mimetype),
        data: file.buffer.toString('base64')
      }
    });
  }

  const msg = await anthropic.messages.create({
    model,
    max_tokens: Number(process.env.STOREFRONT_AI_MAX_TOKENS) || 1800,
    messages: [{ role: 'user', content }]
  });

  const block = Array.isArray(msg.content) ? msg.content.find((b) => b.type === 'text') : null;
  const rawText = block?.text || '';
  const parsed = extractJsonObject(rawText);
  if (!parsed?.storefrontConfig) {
    const err = new Error('AI did not return a valid storefront design. Try a more specific prompt.');
    err.status = 502;
    throw err;
  }

  return {
    storefrontConfig: normalizeStorefrontConfig(parsed.storefrontConfig, currentConfig),
    storefrontDetails: normalizeStorefrontDetails(parsed.storefrontDetails, businessName, currentDetails),
    reasoning: String(parsed.reasoning || '').trim().slice(0, 500) || null
  };
}

module.exports = {
  generateStorefrontWithClaude,
  normalizeStorefrontConfig,
  normalizeStorefrontDetails
};
