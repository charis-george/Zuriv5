/**
 * Cap PostgREST `.in()` URL size.
 * Undici/Supabase reject ~16KB request URLs (400 / UND_ERR_HEADERS_OVERFLOW).
 * Each UUID is ~36 chars + commas ≈ keep chunks small.
 */
const DEFAULT_CHUNK = Math.max(20, Math.min(80, Number(process.env.SUPABASE_IN_CHUNK) || 40));

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} table
 * @param {string} columns
 * @param {string} column
 * @param {string[]} ids
 * @param {{ chunkSize?: number, refine?: (q: any) => any }} [opts]
 * @returns {Promise<{ data: any[] | null, error: any }>}
 */
async function selectInChunks(supabase, table, columns, column, ids, opts = {}) {
  const chunkSize = Math.max(10, Number(opts.chunkSize) || DEFAULT_CHUNK);
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return { data: [], error: null };

  const all = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    let q = supabase.from(table).select(columns).in(column, chunk);
    if (typeof opts.refine === 'function') q = opts.refine(q);
    const { data, error } = await q;
    if (error) return { data: null, error };
    if (data?.length) all.push(...data);
  }
  return { data: all, error: null };
}

module.exports = {
  selectInChunks,
  DEFAULT_CHUNK
};
