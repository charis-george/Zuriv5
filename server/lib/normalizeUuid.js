/**
 * Normalize UUID-like ids so Postgres accepts them.
 * Share apps / copy-paste often insert spaces or breaks inside long ids
 * (e.g. "5b413bab-d9fa-4597-9822- 36afa2035370").
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip whitespace and zero-width characters from an id string. */
function normalizeUuid(value) {
  if (value == null) return null;
  const cleaned = String(value)
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .trim();
  return cleaned || null;
}

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

/** Normalize and validate; returns null if not a UUID after cleaning. */
function requireUuid(value) {
  const normalized = normalizeUuid(value);
  if (!normalized || !isUuid(normalized)) return null;
  return normalized;
}

module.exports = { normalizeUuid, isUuid, requireUuid, UUID_RE };
