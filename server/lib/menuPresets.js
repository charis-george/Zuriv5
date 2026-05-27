const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { getBusinessPlan, canAccessAnalytics } = require('./plans');

const supabase = getDb();

function normalizeCatalogMode(value) {
  return value === 'ticketing' ? 'ticketing' : 'menu';
}

let presetsTableAvailable = null;

async function checkPresetsTable() {
  if (presetsTableAvailable !== null) return presetsTableAvailable;
  const { error } = await supabase.from('menu_presets').select('id').limit(1);
  presetsTableAvailable = !error;
  return presetsTableAvailable;
}

async function getBusinessCatalogMode(businessId) {
  const { data, error } = await supabase
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

  const { data: existing } = await supabase
    .from('menu_presets')
    .select('id, name, preset_mode, display_order, created_at')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: true });

  if (existing?.length) return existing;

  const id = uuidv4();
  const name = mode === 'ticketing' ? 'Main tickets' : 'Main menu';
  const { data: created, error } = await supabase
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

  const { data: biz } = await supabase
    .from('businesses')
    .select('active_menu_preset_id')
    .eq('id', businessId)
    .maybeSingle();

  if (!biz?.active_menu_preset_id) {
    await supabase
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

  const { data: biz } = await supabase
    .from('businesses')
    .select('active_menu_preset_id')
    .eq('id', businessId)
    .maybeSingle();

  if (biz?.active_menu_preset_id) {
    const { data: active } = await supabase
      .from('menu_presets')
      .select('id, preset_mode')
      .eq('id', biz.active_menu_preset_id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (active && normalizeCatalogMode(active.preset_mode) === mode) {
      return active.id;
    }
  }

  const { data: fallback } = await supabase
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

async function listPresetsForBusiness(businessId, catalogMode) {
  const mode = normalizeCatalogMode(catalogMode);
  if (!(await checkPresetsTable())) {
    return { presets: [], activePresetId: null, presetsEnabled: false };
  }

  await ensureDefaultPresets(businessId, mode);
  const activePresetId = await resolveActivePresetId(businessId, mode);

  const { data: rows, error } = await supabase
    .from('menu_presets')
    .select('id, business_id, name, preset_mode, display_order, created_at')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('listPresetsForBusiness', error);
    return { presets: [], activePresetId: null, presetsEnabled: false };
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
  const { data: maxRow } = await supabase
    .from('menu_presets')
    .select('display_order')
    .eq('business_id', businessId)
    .eq('preset_mode', mode)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const id = uuidv4();
  const displayOrder = (maxRow?.display_order ?? -1) + 1;
  const { data, error } = await supabase
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

  const { data, error } = await supabase
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

  const { data: preset, error } = await supabase
    .from('menu_presets')
    .select('id, preset_mode')
    .eq('id', presetId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !preset) return { error: 'Preset not found', status: 404 };

  const catalogMode = normalizeCatalogMode(preset.preset_mode);
  const { error: updErr } = await supabase
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

  const { data: preset } = await supabase
    .from('menu_presets')
    .select('id, preset_mode')
    .eq('id', presetId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!preset) return { error: 'Preset not found', status: 404 };

  const { count } = await supabase
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

  await supabase.from('menu_items').delete().eq('business_id', businessId).eq('preset_id', presetId);
  await supabase.from('categories').delete().eq('business_id', businessId).eq('preset_id', presetId);

  const { error } = await supabase.from('menu_presets').delete().eq('id', presetId).eq('business_id', businessId);
  if (error) {
    console.error('deletePreset', error);
    return { error: 'Failed to delete preset', status: 500 };
  }

  return { success: true };
}

async function duplicatePreset(businessId, presetId) {
  const gate = await requireGrowthPlus(businessId);
  if (gate.error) return { error: gate.error, status: 403 };

  const { data: source } = await supabase
    .from('menu_presets')
    .select('*')
    .eq('id', presetId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!source) return { error: 'Preset not found', status: 404 };

  const newPresetId = uuidv4();
  const newName = `${source.name} copy`.slice(0, 80);
  const { data: maxRow } = await supabase
    .from('menu_presets')
    .select('display_order')
    .eq('business_id', businessId)
    .eq('preset_mode', source.preset_mode)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insErr } = await supabase.from('menu_presets').insert({
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

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('business_id', businessId)
    .eq('preset_id', presetId);

  const categoryIdMap = new Map();
  for (const cat of categories || []) {
    const newCatId = uuidv4();
    categoryIdMap.set(cat.id, newCatId);
    await supabase.from('categories').insert({
      id: newCatId,
      business_id: businessId,
      name: cat.name,
      display_order: cat.display_order ?? 0,
      category_mode: cat.category_mode || source.preset_mode,
      preset_id: newPresetId
    });
  }

  const { data: items } = await supabase
    .from('menu_items')
    .select('*')
    .eq('business_id', businessId)
    .eq('preset_id', presetId);

  for (const item of items || []) {
    await supabase.from('menu_items').insert({
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
  requireGrowthPlus
};
