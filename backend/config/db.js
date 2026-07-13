/**
 * MongoDB connection configuration
 * Supports both external MongoDB and embedded MongoDB (mongodb-memory-server)
 */
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/snake-game';

let mongod = null; // embedded mongod instance

async function connectDB() {
  // Try connecting to external MongoDB first
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('[DB] External MongoDB connected successfully');
    return;
  } catch (err) {
    console.log('[DB] External MongoDB not available, starting embedded MongoDB...');
  }

  // Fall back to embedded MongoDB with persistence
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');

    // Persist data to disk so scores survive restarts
    const dbPath = path.join(__dirname, '..', '.data', 'mongo');
    fs.mkdirSync(dbPath, { recursive: true });

    mongod = await MongoMemoryServer.create({
      instance: {
        dbPath,
        storageEngine: 'wiredTiger',
      },
      binary: {
        version: '7.0.0', // stable version
      },
    });

    const uri = mongod.getUri();
    console.log(`[DB] Embedded MongoDB started at ${uri}`);

    await mongoose.connect(uri);
    console.log('[DB] Connected to embedded MongoDB');
  } catch (embeddedErr) {
    console.error('[DB] Failed to start embedded MongoDB:', embeddedErr.message);
    console.error('[DB] Full error:', embeddedErr);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected');
  });
}

// Graceful shutdown
async function closeDB() {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    console.log('[DB] Embedded MongoDB stopped');
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDB();
  process.exit(0);
});

module.exports = connectDB;
