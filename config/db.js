'use strict';

/**
 * @file config/db.js
 * @description MongoDB connection module using Mongoose.
 * Reads MONGODB_URI from environment variables and establishes a connection.
 */

const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI specified in environment variables.
 * Logs the connected host on success.
 * On error, logs the error message and exits the process with code 1
 * to prevent the application from running without a database.
 *
 * @async
 * @function connectDB
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // useNewUrlParser and useUnifiedTopology are deprecated in Mongoose 8+
      // but left here for compatibility awareness
    });

    console.log(`[MongoDB] Connected: ${conn.connection.host}`);

    /**
     * Clean up stale indexes in the profiles collection.
     * An earlier schema revision used a field called 'user' (now 'userId').
     * The old unique index 'user_1' causes E11000 duplicate key errors
     * because every new profile has user: null (field no longer exists).
     * This block detects and drops it automatically on startup.
     */
    try {
      const profilesCollection = conn.connection.collection('profiles');
      const indexes = await profilesCollection.indexes();
      const staleIndex = indexes.find((idx) => idx.name === 'user_1');
      if (staleIndex) {
        await profilesCollection.dropIndex('user_1');
        console.log('[MongoDB] Dropped stale index "user_1" from profiles collection.');
      }
    } catch (indexErr) {
      // Collection may not exist yet on first run — that's fine
      if (indexErr.codeName !== 'NamespaceNotFound') {
        console.warn('[MongoDB] Could not check/drop stale index:', indexErr.message);
      }
    }
  } catch (err) {
    console.error(`[MongoDB] Connection failed: ${err.message}`);
    if (err.message.includes('<your-cluster>')) {
      // Placeholder URI — allow server to start so Swagger UI is accessible
      console.warn('[MongoDB] ⚠  Update MONGODB_URI in .env with your Atlas cluster hostname.');
      console.warn('[MongoDB] ⚠  Example: mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/alumni_db');
      return; // Don't exit — let Swagger UI and health check still serve
    }
    // Real connection error — exit so the process manager can restart
    process.exit(1);
  }
};

module.exports = connectDB;
