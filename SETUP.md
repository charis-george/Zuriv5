# ZURI Setup Guide

## Quick Start

### 1. Install Dependencies

Run this command to install all dependencies for both frontend and backend:

```bash
npm run install:all
```

Or manually:

```bash
npm install
cd server && npm install
cd ../client && npm install
```

### 2. Environment Setup

Create a `.env` file in the `server/` directory:

```env
PORT=3000
JWT_SECRET=your-secret-key-here
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 3. Start Development Servers

Run both frontend and backend simultaneously:

```bash
npm run dev
```

Or separately:

```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Frontend
npm run dev:client
```

### 4. Access the Application

- **Home Page**: http://localhost:5173
- **Backend API**: http://localhost:3000

## Demo Account

A demo business account is automatically created:

- **Email**: demo@zuri.com
- **Password**: demo123

Login at: http://localhost:5173/business/login

## Features

### For Customers
1. Scan QR code or visit `/scan` to use the QR scanner
2. Browse menu and add items to cart
3. Place order with name and phone number
4. Receive order confirmation with estimated prep time

### For Businesses
1. Login at `/business/login`
2. View real-time orders in dashboard
3. Update order status (pending → preparing → ready → completed)
4. View analytics:
   - Sales summary
   - Popular items
   - Peak hours
   - Profit margins
5. Download QR code for tables

## Database

The system uses SQLite for simplicity. The database file is created automatically at `server/database.sqlite`.

To reset the database, delete `server/database.sqlite` and restart the server.

## Production Build

```bash
# Build frontend
npm run build

# Start production server
npm start
```

The production server will serve the built React app from the `client/dist` directory.

