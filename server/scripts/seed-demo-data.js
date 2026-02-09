const { getDb } = require('../database');

const supabase = getDb();

// Seed demo menu data
const seedDemoData = async (businessId) => {
  try {
    // Check if menu already exists
    const { data: existingItems } = await supabase
      .from('menu_items')
      .select('id')
      .eq('business_id', businessId)
      .limit(1);

    if (existingItems && existingItems.length > 0) {
      console.log('Demo menu already exists');
      return;
    }

    // Create categories
    const categories = [
      { name: 'Appetizers', order: 1 },
      { name: 'Main Courses', order: 2 },
      { name: 'Desserts', order: 3 },
      { name: 'Drinks', order: 4 }
    ];

    const { data: createdCategories, error: categoriesError } = await supabase
      .from('categories')
      .insert(
        categories.map(cat => ({
          business_id: businessId,
          name: cat.name,
          display_order: cat.order
        }))
      )
      .select();

    if (categoriesError) {
      console.error('Error creating categories:', categoriesError);
      throw categoriesError;
    }

    // Create menu items
    const menuItems = [
      // Appetizers
      { categoryId: createdCategories[0].id, name: 'Spring Rolls', description: 'Crispy vegetable spring rolls with sweet chili sauce', price: 2500, cost: 1000 },
      { categoryId: createdCategories[0].id, name: 'Chicken Wings', description: 'Spicy fried chicken wings (6 pieces)', price: 3500, cost: 1500 },
      { categoryId: createdCategories[0].id, name: 'Caesar Salad', description: 'Fresh romaine lettuce with caesar dressing', price: 3000, cost: 1200 },
      
      // Main Courses
      { categoryId: createdCategories[1].id, name: 'Grilled Chicken', description: 'Tender grilled chicken breast with vegetables', price: 4500, cost: 2000 },
      { categoryId: createdCategories[1].id, name: 'Beef Burger', description: 'Classic beef burger with fries', price: 4000, cost: 1800 },
      { categoryId: createdCategories[1].id, name: 'Pasta Carbonara', description: 'Creamy pasta with bacon and parmesan', price: 4200, cost: 1900 },
      { categoryId: createdCategories[1].id, name: 'Jollof Rice', description: 'Traditional Nigerian jollof rice with chicken', price: 3800, cost: 1700 },
      { categoryId: createdCategories[1].id, name: 'Fish & Chips', description: 'Battered fish with crispy fries', price: 4800, cost: 2200 },
      
      // Desserts
      { categoryId: createdCategories[2].id, name: 'Chocolate Cake', description: 'Rich chocolate cake slice', price: 2000, cost: 800 },
      { categoryId: createdCategories[2].id, name: 'Ice Cream', description: 'Vanilla, chocolate, or strawberry', price: 1500, cost: 600 },
      { categoryId: createdCategories[2].id, name: 'Fruit Salad', description: 'Fresh seasonal fruits', price: 1800, cost: 700 },
      
      // Drinks
      { categoryId: createdCategories[3].id, name: 'Coca Cola', description: 'Cold soft drink', price: 500, cost: 200 },
      { categoryId: createdCategories[3].id, name: 'Orange Juice', description: 'Fresh orange juice', price: 1200, cost: 500 },
      { categoryId: createdCategories[3].id, name: 'Coffee', description: 'Hot coffee', price: 1500, cost: 600 },
      { categoryId: createdCategories[3].id, name: 'Water', description: 'Bottled water', price: 300, cost: 100 }
    ];

    const itemsToInsert = menuItems.map((item, index) => ({
      business_id: businessId,
      category_id: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      cost: item.cost,
      available: true,
      display_order: index
    }));

    const { error: itemsError } = await supabase
      .from('menu_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('Error inserting menu items:', itemsError);
      throw itemsError;
    }

    console.log('Demo menu data seeded successfully');
  } catch (error) {
    console.error('Error seeding demo data:', error);
    throw error;
  }
};

// Run if called directly
if (require.main === module) {
  console.log('This script should be called from database.js initialization');
  process.exit(0);
}

module.exports = { seedDemoData };
