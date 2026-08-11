const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { getBusinessPlan, canAccessAnalytics } = require('./plans');
const { normalizeBusinessMode } = require('./businessMode');

function db() {
  return getDb();
}

function normalizeCatalogMode(value) {
  return normalizeBusinessMode(value);
}

let presetsTableAvailable = null;
let presetsTableCheckHint = null;

function classifyPresetsTableError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (code === '42P01' || /relation.*menu_presets.*does not exist/i.test(msg)) {
    return 'migration_missing';
  }
  if (/schema cache/i.test(msg) || code === 'PGRST204' || code === 'PGRST205') {
    return 'schema_cache';
  }
  if (/permission denied/i.test(msg) || code === '42501') {
    return 'permission_denied';
  }
  return 'unknown';
}

async function checkPresetsTable() {
  if (presetsTableAvailable === true) return true;
  const { error } = await db().from('menu_presets').select('id').limit(1);
  if (!error) {
    presetsTableAvailable = true;
    presetsTableCheckHint = null;
    return true;
  }
  const kind = classifyPresetsTableError(error);
  presetsTableCheckHint = kind;
  console.warn('[menuPresets] menu_presets check failed:', error?.message || error, { kind });
  if (kind === 'migration_missing') {
    presetsTableAvailable = false;
    return false;
  }
  // Do not permanently cache false for schema-cache / transient errors.
  return false;
}

async function getBusinessCatalogMode(businessId) {
  const { data, error } = await db()
    .from('businesses')
    .select('business_mode')
    .eq('id', businessId)
    .maybeSingle();
  if (error) return 'menu';
  return normalizeCatalogMode(data?.business_mode);
}

async function ensureDefaultPresets(businessId, catalogMode) {
  const mode = normalizeCatalogMode(catalogMode);
  if (!(await checkPresetsTable())) return null;

  const { data: businessRow, error: businessError } = await db()
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .maybeSingle();
  if (businessError || !businessRow) return null;

  const { data: existing } = await db()
    .from('menu_presets')
    .select('id, name, preset_mode, display_order, created_at')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: true });

  if (existing?.length) return existing;

  const id = uuidv4();
  const name = mode === 'ticketing' ? 'Main tickets' : mode === 'shop' ? 'Main catalog' : 'Main menu';
  const { data: created, error } = await db()
    .from('menu_presets')
    .insert({
      id,
      business_id: businessId,
      name,
      preset_mode: mode,
      display_order: 0
    })
    .select('id, name, preset_mode, display_order, created_at')
    .single();

  if (error) {
    console.error('ensureDefaultPresets', error);
    return null;
  }

  const { data: biz } = await db()
    .from('businesses')
    .select('active_menu_preset_id')
    .eq('id', businessId)
    .maybeSingle();

  if (!biz?.active_menu_preset_id) {
    await db()
      .from('businesses')
      .update({ active_menu_preset_id: id })
      .eq('id', businessId);
  }

  return [created];
}

async function resolveActivePresetId(businessId, catalogMode) {
  if (!(await checkPresetsTable())) return null;
  const mode = normalizeCatalogMode(catalogMode);
  await ensureDefaultPresets(businessId, mode);

  const { data: biz } = await db()
    .from('businesses')
    .select('active_menu_preset_id')
    .eq('id', businessId)
    .maybeSingle();

  if (biz?.active_menu_preset_id) {
    const { data: active } = await db()
      .from('menu_presets')
      .select('id, preset_mode')
      .eq('id', biz.active_menu_preset_id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (active && normalizeCatalogMode(active.preset_mode) === mode) {
      return active.id;
    }
  }

  const { data: fallback } = await db()
    .from('menu_presets')
    .select('id')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  return fallback?.id || null;
}

function formatPresetRow(row, isActive) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    presetMode: normalizeCatalogMode(row.preset_mode),
    displayOrder: row.display_order ?? 0,
    createdAt: row.created_at || null,
    isActive: !!isActive
  };
}

function presetsUnavailablePayload() {
  if (presetsTableCheckHint === 'schema_cache') {
    return {
      presets: [],
      activePresetId: null,
      presetsEnabled: false,
      presetsHint:
        'Supabase schema cache is stale. In SQL Editor run: NOTIFY pgrst, \'reload schema\'; then restart the API.'
    };
  }
  if (presetsTableCheckHint === 'permission_denied') {
    return {
      presets: [],
      activePresetId: null,
      presetsEnabled: false,
      presetsHint:
        'Server cannot read menu_presets. Use SUPABASE_SERVICE_ROLE_KEY (not anon) on the API, or apply migration 017_menu_presets_rls.sql.'
    };
  }
  if (presetsTableCheckHint === 'migration_missing') {
    return {
      presets: [],
      activePresetId: null,
      presetsEnabled: false,
      presetsHint: 'Apply migration 016_menu_catalog_presets.sql on the same Supabase project as your API env vars.'
    };
  }
  return {
    presets: [],
    activePresetId: null,
    presetsEnabled: false,
    presetsHint:
      'Could not reach menu_presets. Confirm migration 016 on this project, reload schema (NOTIFY pgrst), and restart the API.'
  };
}

async function listPresetsForBusiness(businessId, catalogMode) {
  const mode = normalizeCatalogMode(catalogMode);
  if (!(await checkPresetsTable())) {
    return presetsUnavailablePayload();
  }

  await ensureDefaultPresets(businessId, mode);
  const activePresetId = await resolveActivePresetId(businessId, mode);

  const { data: rows, error } = await db()
    .from('menu_presets')
    .select('id, business_id, name, preset_mode, display_order, created_at')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('listPresetsForBusiness', error);
    presetsTableCheckHint = classifyPresetsTableError(error);
    return presetsUnavailablePayload();
  }

  return {
    presetsEnabled: true,
    activePresetId,
    presets: (rows || []).map((p) => formatPresetRow(p, p.id === activePresetId))
  };
}

async function requireGrowthPlus(businessId) {
  const plan = await getBusinessPlan(businessId);
  if (!canAccessAnalytics(plan)) {
    return { error: 'Menu catalog presets are available on Growth and above.' };
  }
  return { plan };
}

async function createPreset(businessId, name, catalogMode) {
  const gate = await requireGrowthPlus(businessId);
  if (gate.error) return { error: gate.error, status: 403 };
  if (!(await checkPresetsTable())) {
    return { error: 'Menu presets are not available until database migration 016 is applied.', status: 503 };
  }

  const mode = normalizeCatalogMode(catalogMode);
  const trimmed = String(name || '').trim() || 'New preset';
  const { data: maxRow } = await db()
    .from('menu_presets')
    .select('display_order')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const id = uuidv4();
  const displayOrder = (maxRow?.display_order ?? -1) + 1;
  const { data, error } = await db()
    .from('menu_presets')
    .insert({
      id,
      business_id: businessId,
      name: trimmed.slice(0, 80),
      preset_mode: mode,
      display_order: displayOrder
    })
    .select('*')
    .single();

  if (error) {
    console.error('createPreset', error);
    return { error: 'Failed to create preset', status: 500 };
  }

  return { preset: formatPresetRow(data, false) };
}

async function renamePreset(businessId, presetId, name) {
  const gate = await requireGrowthPlus(businessId);
  if (gate.error) return { error: gate.error, status: 403 };

  const trimmed = String(name || '').trim();
  if (!trimmed) return { error: 'Name is required', status: 400 };

  const { data, error } = await db()
    .from('menu_presets')
    .update({ name: trimmed.slice(0, 80), updated_at: new Date().toISOString() })
    .eq('id', presetId)
    .eq('business_id', businessId)
    .select('*')
    .single();

  if (error || !data) return { error: 'Preset not found', status: 404 };
  const activePresetId = await resolveActivePresetId(businessId, data.preset_mode);
  return { preset: formatPresetRow(data, data.id === activePresetId) };
}

async function activatePreset(businessId, presetId) {
  const gate = await requireGrowthPlus(businessId);
  if (gate.error) return { error: gate.error, status: 403 };

  const { data: preset, error } = await db()
    .from('menu_presets')
    .select('id, preset_mode')
    .eq('id', presetId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !preset) return { error: 'Preset not found', status: 404 };

  const catalogMode = normalizeCatalogMode(preset.preset_mode);
  const { error: updErr } = await db()
    .from('businesses')
    .update({ active_menu_preset_id: presetId })
    .eq('id', businessId);

  if (updErr) {
    console.error('activatePreset', updErr);
    return { error: 'Failed to activate preset', status: 500 };
  }

  return { activePresetId: presetId, catalogMode };
}

async function deletePreset(businessId, presetId) {
  const gate = await requireGrowthPlus(businessId);
  if (gate.error) return { error: gate.error, status: 403 };

  const { data: preset } = await db()
    .from('menu_presets')
    .select('id, preset_mode')
    .eq('id', presetId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!preset) return { error: 'Preset not found', status: 404 };

  const { count } = await db()
    .from('menu_presets')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('preset_mode', preset.preset_mode);

  if ((count || 0) <= 1) {
    return { error: 'You must keep at least one catalog preset.', status: 400 };
  }

  const activePresetId = await resolveActivePresetId(businessId, preset.preset_mode);
  if (activePresetId === presetId) {
    return { error: 'Switch to another live preset before deleting this one.', status: 400 };
  }

  await db().from('menu_items').delete().eq('business_id', businessId).eq('preset_id', presetId);
  await db().from('categories').delete().eq('business_id', businessId).eq('preset_id', presetId);

  const { error } = await db().from('menu_presets').delete().eq('id', presetId).eq('business_id', businessId);
  if (error) {
    console.error('deletePreset', error);
    return { error: 'Failed to delete preset', status: 500 };
  }

  return { success: true };
}

async function duplicatePreset(businessId, presetId) {
  const gate = await requireGrowthPlus(businessId);
  if (gate.error) return { error: gate.error, status: 403 };

  const { data: source } = await db()
    .from('menu_presets')
    .select('*')
    .eq('id', presetId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!source) return { error: 'Preset not found', status: 404 };

  const newPresetId = uuidv4();
  const newName = `${source.name} copy`.slice(0, 80);
  const { data: maxRow } = await db()
    .from('menu_presets')
    .select('display_order')
    .eq('business_id', businessId)
    .eq('preset_mode', source.preset_mode)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insErr } = await db().from('menu_presets').insert({
    id: newPresetId,
    business_id: businessId,
    name: newName,
    preset_mode: source.preset_mode,
    display_order: (maxRow?.display_order ?? 0) + 1
  });

  if (insErr) {
    console.error('duplicatePreset insert', insErr);
    return { error: 'Failed to duplicate preset', status: 500 };
  }

  const { data: categories } = await db()
    .from('categories')
    .select('*')
    .eq('business_id', businessId)
    .eq('preset_id', presetId);

  const categoryIdMap = new Map();
  for (const cat of categories || []) {
    const newCatId = uuidv4();
    categoryIdMap.set(cat.id, newCatId);
    await db().from('categories').insert({
      id: newCatId,
      business_id: businessId,
      name: cat.name,
      display_order: cat.display_order ?? 0,
      category_mode: cat.category_mode || source.preset_mode,
      preset_id: newPresetId
    });
  }

  const { data: items } = await db()
    .from('menu_items')
    .select('*')
    .eq('business_id', businessId)
    .eq('preset_id', presetId);

  for (const item of items || []) {
    await db().from('menu_items').insert({
      id: uuidv4(),
      business_id: businessId,
      category_id: item.category_id ? categoryIdMap.get(item.category_id) || null : null,
      name: item.name,
      description: item.description,
      price: item.price,
      cost: item.cost ?? 0,
      image_url: item.image_url,
      display_order: item.display_order ?? 0,
      available: item.available !== false,
      estimated_prep_time: item.estimated_prep_time,
      stock_on_hand: item.stock_on_hand,
      low_stock_threshold: item.low_stock_threshold,
      sold_out_auto_hidden: item.sold_out_auto_hidden,
      max_per_user: item.max_per_user,
      group_size: item.group_size,
      min_per_order: item.min_per_order,
      pricing_type: item.pricing_type,
      perks: item.perks,
      canonical_dish_id: item.canonical_dish_id,
      ingredients: item.ingredients,
      dish_tags: item.dish_tags,
      item_mode: item.item_mode || source.preset_mode,
      preset_id: newPresetId
    });
  }

  return { preset: formatPresetRow({ ...source, id: newPresetId, name: newName }, false) };
}

function matchesPreset(row, presetId) {
  if (!presetId) return true;
  if (!row.preset_id) return true;
  return row.preset_id === presetId;
}

async function ensureCatalogPresetsForProfiles(businessId, profiles, catalogMode) {
  const mode = normalizeCatalogMode(catalogMode);
  if (!Array.isArray(profiles) || !profiles.length) return profiles || [];
  if (!(await checkPresetsTable())) return profiles;

  await ensureDefaultPresets(businessId, mode);

  const { data: allPresets } = await db()
    .from('menu_presets')
    .select('id, name, display_order')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: true });

  const presetPool = [...(allPresets || [])];
  const usedPresetIds = new Set();
  const result = [];

  for (let i = 0; i < profiles.length; i += 1) {
    const profile = profiles[i];
    let presetId = profile.catalogPresetId || null;

    if (presetId && presetPool.some((p) => p.id === presetId)) {
      usedPresetIds.add(presetId);
      result.push({ ...profile, catalogPresetId: presetId });
      continue;
    }

    const unused = presetPool.filter((p) => !usedPresetIds.has(p.id));
    const byName = unused.find((p) => String(p.name || '').trim() === String(profile.name || '').trim());
    if (byName) {
      presetId = byName.id;
      usedPresetIds.add(presetId);
      result.push({ ...profile, catalogPresetId: presetId });
      continue;
    }

    if ((profile.isDefault || i === 0) && unused.length > 0) {
      presetId = unused[0].id;
      usedPresetIds.add(presetId);
      result.push({ ...profile, catalogPresetId: presetId });
      continue;
    }

    const newId = uuidv4();
    const displayOrder =
      presetPool.reduce((max, p) => Math.max(max, p.display_order ?? 0), -1) + 1 + result.length;
    const { error } = await db().from('menu_presets').insert({
      id: newId,
      business_id: businessId,
      name: String(profile.name || (mode === 'ticketing' ? 'Tickets' : mode === 'shop' ? 'Catalog' : 'Menu')).slice(0, 80),
      preset_mode: mode,
      display_order: displayOrder
    });
    if (!error) {
      presetId = newId;
      presetPool.push({ id: newId, name: profile.name, display_order: displayOrder });
      usedPresetIds.add(newId);
    }
    result.push({ ...profile, catalogPresetId: presetId });
  }

  return result;
}

async function resolvePresetIdFromStorefront(businessId, storefrontSlugOrId, eventSlug) {
  const { data: biz } = await db()
    .from('businesses')
    .select('storefront_profiles, storefront_config, storefront_details, business_mode')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz) return null;

  const { normalizeStorefrontProfiles, findProfileBySlugOrId, findProfileForEvent } = require('./storefrontProfiles');
  const mode = normalizeCatalogMode(biz.business_mode);
  let profiles = normalizeStorefrontProfiles(biz);
  profiles = await ensureCatalogPresetsForProfiles(businessId, profiles, mode);

  let profile = null;
  if (eventSlug) {
    profile = findProfileForEvent(profiles, eventSlug)?.profile || null;
  }
  if (!profile && storefrontSlugOrId) {
    profile = findProfileBySlugOrId(profiles, storefrontSlugOrId);
  }
  if (!profile) {
    profile = profiles.find((p) => p.isDefault) || profiles[0] || null;
  }
  return profile?.catalogPresetId || (await resolveActivePresetId(businessId, mode));
}

module.exports = {
  normalizeCatalogMode,
  checkPresetsTable,
  getBusinessCatalogMode,
  resolveActivePresetId,
  listPresetsForBusiness,
  createPreset,
  renamePreset,
  activatePreset,
  deletePreset,
  duplicatePreset,
  matchesPreset,
  ensureCatalogPresetsForProfiles,
  resolvePresetIdFromStorefront,
  requireGrowthPlus
};
