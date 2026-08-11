/**
 * Turn a physical menu photo/PDF into structured categories + items via Claude vision.
 */

const { getMaxOutputTokens } = require('./menuDigitizeLimits');

const MAX_CATEGORIES = 40;
const MAX_ITEMS = 200;

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

function parsePrice(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const s = String(value).replace(/[₦$,]/g, '').replace(/\s+/g, '').trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function normalizeDigitizedMenu(parsed, catalogMode = 'menu') {
  const categoriesIn = Array.isArray(parsed?.categories) ? parsed.categories : [];
  const categories = [];
  let itemCount = 0;

  for (const cat of categoriesIn.slice(0, MAX_CATEGORIES)) {
    const name = String(cat?.name || '').trim();
    if (!name) continue;

    const itemsIn = Array.isArray(cat?.items) ? cat.items : [];
    const items = [];

    for (const item of itemsIn) {
      if (itemCount >= MAX_ITEMS) break;
      const itemName = String(item?.name || '').trim();
      if (!itemName) continue;

      items.push({
        name: itemName.slice(0, 120),
        description: String(item?.description || '').trim().slice(0, 500),
        price: parsePrice(item?.price),
        available: item?.available !== false
      });
      itemCount += 1;
    }

    if (items.length) {
      categories.push({ name: name.slice(0, 80), items });
    }
    if (itemCount >= MAX_ITEMS) break;
  }

  return {
    catalogMode: require('./businessMode').normalizeBusinessMode(catalogMode),
    categories,
    notes: String(parsed?.notes || '').trim().slice(0, 500) || null,
    itemCount,
    categoryCount: categories.length
  };
}

function visionMediaType(mimetype) {
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/gif') return 'image/gif';
  if (mimetype === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function rawImageForVision(buffer, mimetype) {
  return { data: buffer.toString('base64'), media_type: visionMediaType(mimetype) };
}

async function prepareImageForVision(buffer, mimetype) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    console.warn('[ZURI] menuDigitize: sharp unavailable, sending original image:', err?.message || err);
    return rawImageForVision(buffer, mimetype);
  }

  try {
    let pipeline = sharp(buffer).rotate();
    const meta = await pipeline.metadata();
    if (meta.width && meta.width > 2200) {
      pipeline = pipeline.resize({ width: 2200, withoutEnlargement: true });
    }

    if (mimetype === 'image/png') {
      const out = await pipeline.png({ compressionLevel: 8 }).toBuffer();
      return { data: out.toString('base64'), media_type: 'image/png' };
    }
    if (mimetype === 'image/webp') {
      const out = await pipeline.jpeg({ quality: 86 }).toBuffer();
      return { data: out.toString('base64'), media_type: 'image/jpeg' };
    }
    const out = await pipeline.jpeg({ quality: 86 }).toBuffer();
    return { data: out.toString('base64'), media_type: 'image/jpeg' };
  } catch (err) {
    console.warn('[ZURI] menuDigitize: sharp processing failed, sending original image:', err?.message || err);
    return rawImageForVision(buffer, mimetype);
  }
}

function buildDigitizePrompt(catalogMode) {
  const isTickets = catalogMode === 'ticketing';
  return [
    isTickets
      ? 'You are digitizing a poster, flyer, or price list for EVENT TICKETS into a structured catalog.'
      : 'You are digitizing a restaurant or venue PHYSICAL MENU into a structured digital menu.',
    '',
    'Read every visible section, category heading, item name, description, and price.',
    'Return ONLY valid JSON (no markdown fences) in exactly this shape:',
    '{',
    '  "categories": [',
    '    {',
    '      "name": "Category or section name",',
    '      "items": [',
    '        { "name": "Item name", "description": "optional short line", "price": 2500, "available": true }',
    '      ]',
    '    }',
    '  ],',
    '  "notes": "optional brief note about unclear prices or skipped lines"',
    '}',
    '',
    'Rules:',
    '- Prices must be numbers in Nigerian Naira (no currency symbols). Example: ₦2,500 → 2500.',
    '- If a price is missing or unreadable, use 0.',
    '- Group items under the same headings as the source document.',
    '- Do not invent items that are not on the menu.',
    '- Skip addresses, phone numbers, social handles, and legal footers unless they are ticket types.',
    isTickets
      ? '- Each row is a ticket tier, pass, or add-on with its price.'
      : '- Include food, drinks, sides, combos, and specials as separate items.',
    '- Maximum 40 categories and 200 items total.',
    '- Descriptions should be short (under 120 characters) when visible; otherwise use "".'
  ].join('\n');
}

function buildClaudeContent({ buffer, mimetype, catalogMode }) {
  const prompt = buildDigitizePrompt(catalogMode);

  if (mimetype === 'application/pdf') {
    return [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: buffer.toString('base64')
        }
      },
      { type: 'text', text: prompt }
    ];
  }

  return prepareImageForVision(buffer, mimetype).then((image) => [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.media_type,
        data: image.data
      }
    },
    { type: 'text', text: prompt }
  ]);
}

/**
 * @param {{ buffer: Buffer, mimetype: string, filename?: string, catalogMode?: string }} params
 */
async function digitizeMenuFromUpload({ buffer, mimetype, filename, catalogMode = 'menu' }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('AI menu digitization is not configured (missing ANTHROPIC_API_KEY)');
    err.status = 503;
    throw err;
  }

  if (!buffer?.length) {
    const err = new Error('Empty file');
    err.status = 400;
    throw err;
  }

  const allowedImage = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(mimetype);
  const isPdf = mimetype === 'application/pdf';
  if (!allowedImage && !isPdf) {
    const err = new Error('Upload a menu photo (JPEG, PNG, WebP) or PDF');
    err.status = 400;
    throw err;
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

  const content = await buildClaudeContent({ buffer, mimetype, catalogMode });

  const msg = await anthropic.messages.create({
    model,
    max_tokens: getMaxOutputTokens(),
    messages: [{ role: 'user', content }]
  });

  const inputTokens = Number(msg?.usage?.input_tokens) || 0;
  const outputTokens = Number(msg?.usage?.output_tokens) || 0;
  const totalTokens = inputTokens + outputTokens;

  const block = Array.isArray(msg?.content)
    ? msg.content.find((b) => b?.type === 'text' && typeof b.text === 'string')
    : null;
  const text = block?.text || '';
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const err = new Error('AI could not read this menu clearly. Try a sharper photo or a PDF export.');
    err.status = 422;
    throw err;
  }

  const normalized = normalizeDigitizedMenu(parsed, catalogMode);
  if (!normalized.categories.length) {
    const err = new Error('No menu items were detected. Try a clearer photo with visible prices.');
    err.status = 422;
    throw err;
  }

  return {
    ...normalized,
    sourceFilename: filename ? String(filename).slice(0, 120) : null,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens
    }
  };
}

module.exports = {
  digitizeMenuFromUpload,
  normalizeDigitizedMenu,
  extractJsonObject
};
