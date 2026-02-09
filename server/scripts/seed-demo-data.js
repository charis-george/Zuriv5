const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');

const db = getDb();

// Seed demo menu data
const seedDemoData = (businessId) => {
  return new Promise((resolve, reject) => {
    // Check if menu already exists
    db.get("SELECT COUNT(*) as count FROM menu_items WHERE businessId = ?", [businessId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row.count > 0) {
        console.log('Demo menu already exists');
        resolve();
        return;
      }

      // Create categories
      const categories = [
        { id: uuidv4(), name: 'Appetizers', order: 1 },
        { id: uuidv4(), name: 'Main Courses', order: 2 },
        { id: uuidv4(), name: 'Desserts', order: 3 },
        { id: uuidv4(), name: 'Drinks', order: 4 }
      ];

      categories.forEach(cat => {
        db.run(
          'INSERT INTO categories (id, businessId, name, displayOrder) VALUES (?, ?, ?, ?)',
          [cat.id, businessId, cat.name, cat.order]
        );
      });

      // Create menu items
      const menuItems = [
        // Appetizers
        { categoryId: categories[0].id, name: 'Spring Rolls', description: 'Crispy vegetable spring rolls with sweet chili sauce', price: 2500, cost: 1000 },
        { categoryId: categories[0].id, name: 'Chicken Wings', description: 'Spicy fried chicken wings (6 pieces)', price: 3500, cost: 1500 },
        { categoryId: categories[0].id, name: 'Caesar Salad', description: 'Fresh romaine lettuce with caesar dressing', price: 3000, cost: 1200 },
        
        // Main Courses
        { categoryId: categories[1].id, name: 'Grilled Chicken', description: 'Tender grilled chicken breast with vegetables', price: 4500, cost: 2000 },
        { categoryId: categories[1].id, name: 'Beef Burger', description: 'Classic beef burger with fries', price: 4000, cost: 1800 },
        { categoryId: categories[1].id, name: 'Pasta Carbonara', description: 'Creamy pasta with bacon and parmesan', price: 4200, cost: 1900 },
        { categoryId: categories[1].id, name: 'Jollof Rice', description: 'Traditional Nigerian jollof rice with chicken', price: 3800, cost: 1700 },
        { categoryId: categories[1].id, name: 'Fish & Chips', description: 'Battered fish with crispy fries', price: 4800, cost: 2200 },
        
        // Desserts
        { categoryId: categories[2].id, name: 'Chocolate Cake', description: 'Rich chocolate cake slice', price: 2000, cost: 800 },
        { categoryId: categories[2].id, name: 'Ice Cream', description: 'Vanilla, chocolate, or strawberry', price: 1500, cost: 600 },
        { categoryId: categories[2].id, name: 'Fruit Salad', description: 'Fresh seasonal fruits', price: 1800, cost: 700 },
        
        // Drinks
        { categoryId: categories[3].id, name: 'Coca Cola', description: 'Cold soft drink', price: 500, cost: 200 },
        { categoryId: categories[3].id, name: 'Orange Juice', description: 'Fresh orange juice', price: 1200, cost: 500 },
        { categoryId: categories[3].id, name: 'Coffee', description: 'Hot coffee', price: 1500, cost: 600 },
        { categoryId: categories[3].id, name: 'Water', description: 'Bottled water', price: 300, cost: 100 }
      ];

      let completed = 0;
      menuItems.forEach(item => {
        const itemId = uuidv4();
        db.run(
          `INSERT INTO menu_items (id, businessId, categoryId, name, description, price, cost, available, displayOrder)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [itemId, businessId, item.categoryId, item.name, item.description, item.price, item.cost, completed],
          (err) => {
            if (err) {
              console.error('Error inserting menu item:', err);
            }
            completed++;
            if (completed === menuItems.length) {
              console.log('Demo menu data seeded successfully');
              resolve();
            }
          }
        );
      });
    });
  });
};

// Run if called directly
if (require.main === module) {
  // You would need to pass businessId here
  console.log('This script should be called from database.js initialization');
  process.exit(0);
}

module.exports = { seedDemoData };
