const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getDb } = require('../database');
const { getBusinessPlan, canAddMenuPictures } = require('../lib/plans');
const { requireBusinessAuth } = require('../middleware/auth');

const supabase = getDb();

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

    // Group items by category
    const menu = {};
    
    // Initialize categories
    categories.forEach(cat => {
      menu[cat.id] = {
        id: cat.id,
        name: cat.name,
        displayOrder: cat.display_order,
        items: []
      };
    });

    // Add items to categories
    items.forEach(item => {
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
        imageUrl: item.image_url,
        available: item.available !== false
      });
    });

    res.json(Object.values(menu));
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all categories for a business
router.get('/categories/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;

    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, display_order')
      .eq('business_id', businessId)
      .order('display_order');

    if (error) {
      console.error('Get categories error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const formattedCategories = categories.map(cat => ({
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

    const { data, error } = await supabase
      .from('categories')
      .insert({
        id: categoryId,
        business_id: businessId,
        name,
        display_order: displayOrder || 0
      })
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

// Create menu item — requires business auth
router.post('/item', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, categoryId, name, description, price, cost, imageUrl, displayOrder } = req.body;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only create menu items for your own business' });
    }
    const plan = await getBusinessPlan(businessId);
    const allowImage = canAddMenuPictures(plan);
    const itemId = uuidv4();

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        id: itemId,
        business_id: businessId,
        category_id: categoryId || null,
        name,
        description: description || null,
        price,
        cost: cost || 0,
        image_url: allowImage ? (imageUrl || null) : null,
        available: true,
        display_order: displayOrder || 0
      })
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
      imageUrl: data.image_url,
      displayOrder: data.display_order
    });
  } catch (error) {
    console.error('Create menu item error:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

// Update menu item — requires business auth
router.put('/item/:id', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, cost, imageUrl, available, displayOrder, categoryId } = req.body;

    const { data: existing } = await supabase.from('menu_items').select('business_id').eq('id', id).single();
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const plan = await getBusinessPlan(existing.business_id);
    const allowImage = canAddMenuPictures(plan);

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price;
    if (cost !== undefined) updateData.cost = cost;
    if (imageUrl !== undefined) updateData.image_url = allowImage ? imageUrl : null;
    if (available !== undefined) updateData.available = available;
    if (displayOrder !== undefined) updateData.display_order = displayOrder;
    if (categoryId !== undefined) updateData.category_id = categoryId || null;

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

    const { data: existing } = await supabase.from('menu_items').select('business_id').eq('id', id).single();
    if (!existing || existing.business_id !== req.businessId) {
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
