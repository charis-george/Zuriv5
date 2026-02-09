const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

const supabase = getDb();

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

// Create category
router.post('/category', async (req, res) => {
  try {
    const { businessId, name, displayOrder } = req.body;
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

// Create menu item
router.post('/item', async (req, res) => {
  try {
    const { businessId, categoryId, name, description, price, cost, imageUrl, displayOrder } = req.body;
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
        image_url: imageUrl || null,
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

// Update menu item
router.put('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, cost, imageUrl, available, displayOrder, categoryId } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price;
    if (cost !== undefined) updateData.cost = cost;
    if (imageUrl !== undefined) updateData.image_url = imageUrl;
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

// Delete menu item
router.delete('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
