/**
 * Normalize UUID-like ids so API / Postgres lookups succeed.
 * Share apps and copy-paste often insert spaces inside long ids
 * (e.g. "5b413bab-d9fa-4597-9822- 36afa2035370").
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Strip whitespace and zero-width characters from an id string. */
export function normalizeUuid(value: string | null | undefined): string | null {
  if (value == null) return null
  const cleaned = String(value)
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .trim()
  return cleaned || null
}

export function isUuid(value: string | null | undefined): boolean {
  return UUID_RE.test(String(value || ''))
}

/** Decode a route/URI segment then strip embedded whitespace. */
export function normalizeUuidParam(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  return normalizeUuid(decoded) ?? undefined
}
