const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'database.sqlite');
let db;

const init = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
      } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => {
          // Businesses table
          db.run(`CREATE TABLE IF NOT EXISTS businesses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )`, (err) => {
            if (err) console.error('Error creating businesses table:', err.message);
          });

          // Menu categories
          db.run(`CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            businessId TEXT NOT NULL,
            name TEXT NOT NULL,
            displayOrder INTEGER DEFAULT 0,
            FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
          )`, (err) => {
            if (err) console.error('Error creating categories table:', err.message);
          });

          // Menu items
          db.run(`CREATE TABLE IF NOT EXISTS menu_items (
            id TEXT PRIMARY KEY,
            businessId TEXT NOT NULL,
            categoryId TEXT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            cost REAL DEFAULT 0,
            imageUrl TEXT,
            available BOOLEAN DEFAULT 1,
            displayOrder INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE,
            FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
          )`, (err) => {
            if (err) console.error('Error creating menu_items table:', err.message);
          });

          // Orders
          db.run(`CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            businessId TEXT NOT NULL,
            customerName TEXT,
            customerPhone TEXT,
            customerEmail TEXT,
            status TEXT DEFAULT 'pending',
            totalAmount REAL NOT NULL,
            estimatedPrepTime INTEGER DEFAULT 15,
            paymentStatus TEXT DEFAULT 'pending',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            completedAt DATETIME,
            FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
          )`, (err) => {
            if (err) console.error('Error creating orders table:', err.message);
          });

          // Order items
          db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id TEXT PRIMARY KEY,
            orderId TEXT NOT NULL,
            menuItemId TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            specialNotes TEXT,
            FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (menuItemId) REFERENCES menu_items(id) ON DELETE CASCADE
          )`, (err) => {
            if (err) console.error('Error creating order_items table:', err.message);
          });

          // Create default business for testing if it doesn't exist
          createDefaultBusiness().then(resolve).catch(reject);
        });
      }
    });
  });
};

const createDefaultBusiness = () => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id FROM businesses WHERE email = ?`, ['demo@zuri.com'], async (err, row) => {
      if (err) {
        console.error('Error checking default business:', err.message);
        return reject(err);
      }
      if (!row) {
        const businessId = uuidv4();
        const defaultPassword = bcrypt.hashSync('demo123', 10);
        db.run(
          `INSERT INTO businesses (id, name, email, password, phone, address) VALUES (?, ?, ?, ?, ?, ?)`,
          [businessId, 'Demo Restaurant', 'demo@zuri.com', defaultPassword, '+234 123 456 7890', '123 Demo Street'],
          function(err) {
            if (err) {
              console.error('Error creating default business:', err.message);
              return reject(err);
            }
            console.log('Default business created');
            // Seed demo menu data
            const { seedDemoData } = require('./scripts/seed-demo-data');
            seedDemoData(businessId).then(resolve).catch(reject);
          }
        );
      } else {
        console.log('Default business already exists');
        resolve();
      }
    });
  });
};

const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized. Call init() first.');
  }
  return db;
};

module.exports = { init, getDb };
