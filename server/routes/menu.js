const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getDb } = require('../database');
const { getBusinessPlan, canAddMenuPictures, canAccessGuestAiStorefront, canAccessAIFeatures } = require('../lib/plans');
const { buildGuestPersonalization, resolveGuestCustomerId, setGuestPreferences } = require('../lib/guest-personalization');
const { enrichDishMetadata } = require('../lib/dish-enrichment');
const {
  resolveActivePresetId,
  listPresetsForBusiness,
  createPreset,
  renamePreset,
  activatePreset,
  deletePreset,
  duplicatePreset,
  matchesPreset
} = require('../lib/menuPresets');
const { requireBusinessAuth, verifyBusinessToken } = require('../middleware/auth');

const supabase = getDb();

function normalizeCatalogMode(value) {
  return value === 'ticketing' ? 'ticketing' : 'menu';
}

async function getBusinessMode(businessId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('business_mode')
    .eq('id', businessId)
    .maybeSingle();
  if (error) {
    console.warn('[menu] getBusinessMode fallback:', error.message || error);
    return 'menu';
  }
  return normalizeCatalogMode(data?.business_mode);
}

function parseDishFields(body) {
  const out = {};
  if (body.canonicalDishId !== undefined) {
    const v = body.canonicalDishId;
    out.canonical_dish_id = v && String(v).trim() ? String(v).trim().slice(0, 120) : null;
  }
  if (body.ingredients !== undefined) {
    let arr = [];
    if (Array.isArray(body.ingredients)) {
      arr = body.ingredients.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof body.ingredients === 'string' && body.ingredients.trim()) {
      arr = body.ingredients.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    }
    out.ingredients = arr;
  }
  if (body.dishTags !== undefined) {
    out.dish_tags =
      body.dishTags && typeof body.dishTags === 'object' && !Array.isArray(body.dishTags)
        ? body.dishTags
        : {};
  }
  return out;
}

const BUCKET = 'menu-items';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, GIF, WebP) are allowed'));
  }
});

// Upload menu item image (returns public URL) — requires business auth
router.post('/upload-image', requireBusinessAuth, upload.single('image'), async (req, res) => {
  try {
    const businessId = req.body?.businessId;
    if (!businessId || businessId !== req.businessId) {
      return res.status(400).json({ error: 'businessId is required and must match your business' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAddMenuPictures(plan)) return res.status(403).json({ error: 'Menu pictures are available on Starter plan and above. Upgrade to add images.' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No image file provided' });

    const ext = path.extname(req.file.originalname) || '.jpg';
    const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.jpg';
    const filePath = `${businessId}/${uuidv4()}${safeExt}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });
    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      if (uploadError.message && uploadError.message.toLowerCase().includes('bucket not found')) {
        return res.status(500).json({
          error: `Create a public bucket named "${BUCKET}" in Supabase Dashboard → Storage, then try again.`
        });
      }
      return res.status(500).json({ error: uploadError.message || 'Failed to upload image' });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    res.json({ imageUrl: urlData.publicUrl });
  } catch (err) {
    if (err.message && err.message.includes('Only images')) return res.status(400).json({ error: err.message });
    console.error('Upload menu image error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Get menu for a business
router.get('/business/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const activeMode = await getBusinessMode(businessId);
    let catalogPresetId = await resolveActivePresetId(businessId, activeMode);
    const requestedPreset = req.query.presetId;
    if (typeof requestedPreset === 'string' && requestedPreset.trim()) {
      const auth = req.headers.authorization;
      const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const payload = verifyBusinessToken(token);
      if (payload?.sub === businessId) {
        catalogPresetId = requestedPreset.trim();
      }
    }

    // Get all categories for this business
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .eq('business_id', businessId)
      .order('display_order');

    if (categoriesError) {
      console.error('Categories error:', categoriesError);
      return res.status(500).json({ error: 'Database error' });
    }

    // Get all menu items for this business
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('*')
      .eq('business_id', businessId)
      .order('display_order');

    if (itemsError) {
      console.error('Items error:', itemsError);
      return res.status(500).json({ error: 'Database error' });
    }

    const filteredCategories = (categories || []).filter(
      (cat) =>
        (!cat.category_mode || normalizeCatalogMode(cat.category_mode) === activeMode) &&
        matchesPreset(cat, catalogPresetId)
    );
    const filteredItems = (items || []).filter(
      (item) =>
        (!item.item_mode || normalizeCatalogMode(item.item_mode) === activeMode) &&
        matchesPreset(item, catalogPresetId)
    );

    // Group items by category
    const menu = {};
    
    // Initialize categories
    filteredCategories.forEach(cat => {
      menu[cat.id] = {
        id: cat.id,
        name: cat.name,
        displayOrder: cat.display_order,
        items: []
      };
    });

    // Add items to categories
    filteredItems.forEach(item => {
      const catId = item.category_id || 'uncategorized';
      
      if (!menu[catId]) {
        menu[catId] = {
          id: catId,
          name: 'Other',
          items: []
        };
      }

      menu[catId].items.push({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        cost: item.cost,
        estimatedPrepTime: item.estimated_prep_time ?? 15,
        imageUrl: item.image_url,
        available: item.available !== false,
        stockOnHand: item.stock_on_hand ?? null,
        lowStockThreshold: item.low_stock_threshold ?? null,
        soldOutAutoHidden: item.sold_out_auto_hidden === true,
        maxPerUser: item.max_per_user ?? null,
        groupSize: item.group_size ?? null,
        minPerOrder: item.min_per_order ?? null,
        pricingType: item.pricing_type ?? null,
        perks: item.perks ?? null,
        canonicalDishId: item.canonical_dish_id ?? null,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
        dishTags: item.dish_tags && typeof item.dish_tags === 'object' ? item.dish_tags : {}
      });
    });

    res.json(Object.values(menu));
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** Public: guest personalization — trending, personal history, optional cross-venue picks. */
router.get('/business/:businessId/guest-insights', async (req, res) => {
  try {
    const { businessId } = req.params;
    const email = typeof req.query.email === 'string' ? req.query.email : undefined;
    const guestToken = typeof req.query.guestToken === 'string' ? req.query.guestToken : undefined;
    const crossVenueOptIn =
      req.query.crossVenueOptIn === '1' || req.query.crossVenueOptIn === 'true'
        ? true
        : req.query.crossVenueOptIn === '0' || req.query.crossVenueOptIn === 'false'
          ? false
          : undefined;

    const payload = await buildGuestPersonalization({
      businessId,
      email,
      guestToken,
      crossVenueOptIn
    });
    return res.json(payload);
  } catch (e) {
    console.error('guest-insights', e);
    res.status(500).json({ error: 'Failed to load insights' });
  }
});

/** Public: link guest token + email and set cross-venue opt-in. */
router.post('/guest/identity', async (req, res) => {
  try {
    const { guestToken, email, crossVenueOptIn } = req.body || {};
    const customerId = await resolveGuestCustomerId({
      email: typeof email === 'string' ? email : undefined,
      guestToken: typeof guestToken === 'string' ? guestToken : undefined
    });
    if (!customerId) {
      return res.status(400).json({ error: 'guestToken or email required' });
    }
    if (typeof crossVenueOptIn === 'boolean') {
      await setGuestPreferences(customerId, { crossVenueOptIn });
    }
    return res.json({ success: true, customerId });
  } catch (e) {
    console.error('guest identity', e);
    res.status(500).json({ error: 'Failed to save guest preferences' });
  }
});

// Catalog presets (Growth+) — list / create / activate switchable menus
router.get('/presets/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view presets for your own business' });
    }
    const activeMode = await getBusinessMode(businessId);
    const payload = await listPresetsForBusiness(businessId, activeMode);
    return res.json(payload);
  } catch (e) {
    console.error('list presets', e);
    return res.status(500).json({ error: 'Failed to load catalog presets' });
  }
});

router.post('/presets', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, name } = req.body || {};
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only create presets for your own business' });
    }
    const activeMode = await getBusinessMode(businessId);
    const result = await createPreset(businessId, name, activeMode);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (e) {
    console.error('create preset', e);
    return res.status(500).json({ error: 'Failed to create preset' });
  }
});

router.patch('/presets/:presetId', requireBusinessAuth, async (req, res) => {
  try {
    const { presetId } = req.params;
    const { businessId, name } = req.body || {};
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only update presets for your own business' });
    }
    const result = await renamePreset(businessId, presetId, name);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result);
  } catch (e) {
    console.error('rename preset', e);
    return res.status(500).json({ error: 'Failed to rename preset' });
  }
});

router.post('/presets/:presetId/activate', requireBusinessAuth, async (req, res) => {
  try {
    const { presetId } = req.params;
    const { businessId } = req.body || {};
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only activate presets for your own business' });
    }
    const result = await activatePreset(businessId, presetId);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    const io = req.app.get('io');
    if (io) io.to(`storefront-${businessId}`).emit('storefront-updated', { presetActivated: presetId });
    return res.json(result);
  } catch (e) {
    console.error('activate preset', e);
    return res.status(500).json({ error: 'Failed to activate preset' });
  }
});

router.post('/presets/:presetId/duplicate', requireBusinessAuth, async (req, res) => {
  try {
    const { presetId } = req.params;
    const { businessId } = req.body || {};
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only duplicate presets for your own business' });
    }
    const result = await duplicatePreset(businessId, presetId);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (e) {
    console.error('duplicate preset', e);
    return res.status(500).json({ error: 'Failed to duplicate preset' });
  }
});

router.delete('/presets/:presetId', requireBusinessAuth, async (req, res) => {
  try {
    const { presetId } = req.params;
    const businessId = req.businessId;
    const result = await deletePreset(businessId, presetId);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result);
  } catch (e) {
    console.error('delete preset', e);
    return res.status(500).json({ error: 'Failed to delete preset' });
  }
});

// Get all categories for a business
router.get('/categories/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const activeMode = await getBusinessMode(businessId);
    const editPresetId =
      typeof req.query.presetId === 'string' && req.query.presetId.trim()
        ? req.query.presetId.trim()
        : await resolveActivePresetId(businessId, activeMode);

    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('business_id', businessId)
      .order('display_order');

    if (error) {
      console.error('Get categories error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const formattedCategories = categories
      .filter(
        (cat) =>
          (!cat.category_mode || normalizeCatalogMode(cat.category_mode) === activeMode) &&
          matchesPreset(cat, editPresetId)
      )
      .map(cat => ({
      id: cat.id,
      name: cat.name,
      displayOrder: cat.display_order
      }));

    res.json(formattedCategories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create category — requires business auth
router.post('/category', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, name, displayOrder } = req.body;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only create categories for your own business' });
    }
    const categoryId = uuidv4();
    const activeMode = await getBusinessMode(businessId);
    const presetId = await resolveActivePresetId(businessId, activeMode);

    const insertRow = {
      id: categoryId,
      business_id: businessId,
      name,
      display_order: displayOrder || 0,
      category_mode: activeMode
    };
    if (presetId) insertRow.preset_id = presetId;

    const { data, error } = await supabase
      .from('categories')
      .insert(insertRow)
      .select()
      .single();

    if (error) {
      console.error('Create category error:', error);
      return res.status(500).json({ error: 'Failed to create category' });
    }

    res.json({
      id: data.id,
      businessId: data.business_id,
      name: data.name,
      displayOrder: data.display_order
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category (e.g. display order) — requires business auth
router.patch('/category/:categoryId', requireBusinessAuth, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { businessId, displayOrder, name } = req.body;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only update categories for your own business' });
    }
    const activeMode = await getBusinessMode(businessId);
    const { data: existingCategory } = await supabase
      .from('categories')
      .select('category_mode')
      .eq('id', categoryId)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!existingCategory || normalizeCatalogMode(existingCategory.category_mode) !== activeMode) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const updateData = {};
    if (typeof displayOrder === 'number') updateData.display_order = displayOrder;
    if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', categoryId)
      .eq('business_id', businessId)
      .select()
      .single();
    if (error) {
      console.error('Update category error:', error);
      return res.status(500).json({ error: 'Failed to update category' });
    }
    if (!data) return res.status(404).json({ error: 'Category not found' });
    res.json({ id: data.id, name: data.name, displayOrder: data.display_order });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category — requires business auth. Items in this category become uncategorized (category_id set null by DB).
router.delete('/category/:categoryId', requireBusinessAuth, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const businessId = req.businessId;
    const activeMode = await getBusinessMode(businessId);
    const { data: category, error: fetchError } = await supabase
      .from('categories')
      .select('id, business_id, category_mode')
      .eq('id', categoryId)
      .single();
    if (fetchError || !category || category.business_id !== businessId || normalizeCatalogMode(category.category_mode) !== activeMode) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .eq('business_id', businessId);
    if (deleteError) {
      console.error('Delete category error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete category' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Create menu item — requires business auth
router.post('/item', requireBusinessAuth, async (req, res) => {
  try {
    const {
      businessId,
      categoryId,
      name,
      description,
      price,
      cost,
      imageUrl,
      displayOrder,
      estimatedPrepTime,
      stockOnHand,
      lowStockThreshold,
      maxPerUser,
      groupSize,
      minPerOrder,
      pricingType,
      perks
    } = req.body;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only create menu items for your own business' });
    }
    const plan = await getBusinessPlan(businessId);
    const allowImage = canAddMenuPictures(plan);
    const itemId = uuidv4();
    const activeMode = await getBusinessMode(businessId);
    const presetId =
      typeof req.body.presetId === 'string' && req.body.presetId.trim()
        ? req.body.presetId.trim()
        : await resolveActivePresetId(businessId, activeMode);

    const parsedStock =
      stockOnHand === undefined || stockOnHand === null || stockOnHand === ''
        ? null
        : Math.max(0, Math.min(9999, Math.floor(Number(stockOnHand) || 0)));
    const parsedThreshold =
      lowStockThreshold === undefined || lowStockThreshold === null || lowStockThreshold === ''
        ? null
        : Math.max(0, Math.min(9999, Math.floor(Number(lowStockThreshold) || 0)));
    const parsedMaxPerUser =
      maxPerUser === undefined || maxPerUser === null || maxPerUser === ''
        ? null
        : Math.max(1, Math.floor(Number(maxPerUser) || 1));
    const parsedGroupSize =
      groupSize === undefined || groupSize === null || groupSize === ''
        ? null
        : Math.max(1, Math.floor(Number(groupSize) || 1));
    const parsedMinPerOrder =
      minPerOrder === undefined || minPerOrder === null || minPerOrder === ''
        ? null
        : Math.max(1, Math.floor(Number(minPerOrder) || 1));
    const parsedPricingType =
      ['free', 'paid', 'invite_only'].includes(pricingType) ? pricingType : null;
    const parsedPerks =
      Array.isArray(perks) ? perks.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim()) : null;

    const dishFields = parseDishFields(req.body);
    if (
      (!dishFields.ingredients || dishFields.ingredients.length === 0) &&
      canAccessGuestAiStorefront(plan) &&
      name
    ) {
      const auto = enrichDishMetadata(name, description || '');
      if (!dishFields.canonical_dish_id && auto.canonicalDishId) {
        dishFields.canonical_dish_id = auto.canonicalDishId;
      }
      dishFields.ingredients = auto.ingredients;
      dishFields.dish_tags = auto.dishTags;
    }

    const insertItem = {
        id: itemId,
        business_id: businessId,
        category_id: categoryId || null,
        name,
        description: description || null,
        price: parsedPricingType === 'free' ? 0 : price,
        cost: cost || 0,
        estimated_prep_time: estimatedPrepTime ?? 15,
        image_url: allowImage ? (imageUrl || null) : null,
        available: true,
        display_order: displayOrder || 0,
        item_mode: activeMode,
        stock_on_hand: parsedStock,
        low_stock_threshold: parsedThreshold,
        sold_out_auto_hidden: false,
        max_per_user: parsedMaxPerUser,
        group_size: parsedGroupSize,
        min_per_order: parsedMinPerOrder,
        pricing_type: parsedPricingType,
        perks: parsedPerks && parsedPerks.length ? JSON.stringify(parsedPerks) : null,
        ...dishFields,
        updated_at: new Date().toISOString()
      };
    if (presetId) insertItem.preset_id = presetId;

    const { data, error } = await supabase
      .from('menu_items')
      .insert(insertItem)
      .select()
      .single();

    if (error) {
      console.error('Create menu item error:', error);
      return res.status(500).json({ error: 'Failed to create menu item' });
    }

    res.json({
      id: data.id,
      businessId: data.business_id,
      categoryId: data.category_id,
      name: data.name,
      description: data.description,
      price: data.price,
      cost: data.cost,
      estimatedPrepTime: data.estimated_prep_time ?? 15,
      imageUrl: data.image_url,
      displayOrder: data.display_order,
      stockOnHand: data.stock_on_hand ?? null,
      lowStockThreshold: data.low_stock_threshold ?? null,
      soldOutAutoHidden: data.sold_out_auto_hidden === true,
      maxPerUser: data.max_per_user ?? null,
      groupSize: data.group_size ?? null,
      minPerOrder: data.min_per_order ?? null,
      pricingType: data.pricing_type ?? null,
      perks: data.perks ?? null,
      canonicalDishId: data.canonical_dish_id ?? null,
      ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
      dishTags: data.dish_tags && typeof data.dish_tags === 'object' ? data.dish_tags : {}
    });
  } catch (error) {
    console.error('Create menu item error:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

/** Auto-fill ingredients / tags from item name + description (Growth+). */
router.post('/item/:id/enrich-dish', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('menu_items')
      .select('business_id, item_mode, name, description')
      .eq('id', id)
      .single();
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const activeMode = await getBusinessMode(existing.business_id);
    if (normalizeCatalogMode(existing.item_mode) !== activeMode) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const plan = await getBusinessPlan(existing.business_id);
    if (!canAccessGuestAiStorefront(plan)) {
      return res.status(403).json({ error: 'Upgrade to Growth to use dish intelligence' });
    }
    const enriched = enrichDishMetadata(existing.name, existing.description || '');
    const { error } = await supabase
      .from('menu_items')
      .update({
        ingredients: enriched.ingredients,
        dish_tags: enriched.dishTags,
        canonical_dish_id: enriched.canonicalDishId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) {
      console.error('enrich-dish', error);
      return res.status(500).json({ error: 'Failed to enrich dish' });
    }
    return res.json({
      canonicalDishId: enriched.canonicalDishId,
      ingredients: enriched.ingredients,
      dishTags: enriched.dishTags
    });
  } catch (e) {
    console.error('enrich-dish', e);
    res.status(500).json({ error: 'Failed to enrich dish' });
  }
});

// Update menu item — requires business auth
router.put('/item/:id', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      cost,
      imageUrl,
      available,
      displayOrder,
      categoryId,
      estimatedPrepTime,
      stockOnHand,
      lowStockThreshold,
      maxPerUser,
      groupSize,
      minPerOrder
    } = req.body;

    const { data: existing } = await supabase
      .from('menu_items')
      .select('business_id, item_mode, sold_out_auto_hidden')
      .eq('id', id)
      .single();
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const activeMode = await getBusinessMode(existing.business_id);
    if (normalizeCatalogMode(existing.item_mode) !== activeMode) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const plan = await getBusinessPlan(existing.business_id);
    const allowImage = canAddMenuPictures(plan);

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price;
    if (cost !== undefined) updateData.cost = cost;
    if (estimatedPrepTime !== undefined) updateData.estimated_prep_time = estimatedPrepTime;
    if (imageUrl !== undefined) updateData.image_url = allowImage ? imageUrl : null;
    if (available !== undefined) updateData.available = available;
    if (displayOrder !== undefined) updateData.display_order = displayOrder;
    if (categoryId !== undefined) updateData.category_id = categoryId || null;
    if (stockOnHand !== undefined) {
      updateData.stock_on_hand =
        stockOnHand === null || stockOnHand === ''
          ? null
          : Math.max(0, Math.min(9999, Math.floor(Number(stockOnHand) || 0)));
    }
    if (lowStockThreshold !== undefined) {
      updateData.low_stock_threshold =
        lowStockThreshold === null || lowStockThreshold === ''
          ? null
          : Math.max(0, Math.min(9999, Math.floor(Number(lowStockThreshold) || 0)));
    }
    if (maxPerUser !== undefined) {
      updateData.max_per_user =
        maxPerUser === null || maxPerUser === '' ? null : Math.max(1, Math.floor(Number(maxPerUser) || 1));
    }
    if (groupSize !== undefined) {
      updateData.group_size =
        groupSize === null || groupSize === '' ? null : Math.max(1, Math.floor(Number(groupSize) || 1));
    }
    if (minPerOrder !== undefined) {
      updateData.min_per_order =
        minPerOrder === null || minPerOrder === '' ? null : Math.max(1, Math.floor(Number(minPerOrder) || 1));
    }
    if (req.body.pricingType !== undefined) {
      updateData.pricing_type =
        ['free', 'paid', 'invite_only'].includes(req.body.pricingType) ? req.body.pricingType : null;
      if (updateData.pricing_type === 'free') updateData.price = 0;
    }
    if (req.body.perks !== undefined) {
      const pArr = Array.isArray(req.body.perks)
        ? req.body.perks.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
        : null;
      updateData.perks = pArr && pArr.length ? JSON.stringify(pArr) : null;
    }

    Object.assign(updateData, parseDishFields(req.body));

    // Auto-hide sold out items (only when business is tracking stock)
    if (updateData.stock_on_hand !== undefined) {
      const s = updateData.stock_on_hand;
      if (s !== null && Number(s) <= 0) {
        updateData.available = false;
        updateData.sold_out_auto_hidden = true;
      }
      if (s !== null && Number(s) > 0) {
        // If it was auto-hidden, unhide on restock unless owner explicitly set available=false.
        if (existing?.sold_out_auto_hidden) {
          updateData.available = true;
          updateData.sold_out_auto_hidden = false;
        }
      }
    }

    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { error } = await supabase
      .from('menu_items')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Update menu item error:', error);
      return res.status(500).json({ error: 'Failed to update menu item' });
    }

    res.json({ message: 'Menu item updated successfully' });
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// Delete menu item — requires business auth
router.delete('/item/:id', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabase.from('menu_items').select('business_id, item_mode').eq('id', id).single();
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const activeMode = await getBusinessMode(existing.business_id);
    if (normalizeCatalogMode(existing.item_mode) !== activeMode) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete menu item error:', error);
      return res.status(500).json({ error: 'Failed to delete menu item' });
    }

    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

module.exports = router;
