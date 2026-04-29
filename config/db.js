'use strict';

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {});

    console.log(`[MongoDB] Connected: ${conn.connection.host}`);

    try {
      const profilesCollection = conn.connection.collection('profiles');
      const indexes = await profilesCollection.indexes();
      const staleIndex = indexes.find((idx) => idx.name === 'user_1');
      if (staleIndex) {
        await profilesCollection.dropIndex('user_1');
        console.log('[MongoDB] Dropped stale index "user_1" from profiles collection.');
      }
    } catch (indexErr) {

      if (indexErr.codeName !== 'NamespaceNotFound') {
        console.warn('MongoDB Could not check/drop stale index:', indexErr.message);
      }
    }
  } catch (err) {
    console.error(`[MongoDB] Connection failed: ${err.message}`);
    if (err.message.includes('<your-cluster>')) {

      console.warn('MongoDB  Update MONGODB_URI in .env with your Atlas cluster hostname.');
      console.warn('MongoDB Example: mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/alumni_db');
      return;
    }

    process.exit(1);
  }
};

module.exports = connectDB;
