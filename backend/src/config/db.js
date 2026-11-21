const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/foodbridge';
  try {
    await mongoose.connect(uri);
    console.log(`[foodbridge-api] MongoDB connected -> ${uri}`);
  } catch (err) {
    console.error('[foodbridge-api] MongoDB connection error:', err.message);
    process.exit(1);
  }

  // Ongoing visibility after the initial connect — a dropped connection mid-flight
  // (network blip, Atlas maintenance) otherwise fails silently until a request hits it.
  mongoose.connection.on('disconnected', () => {
    console.warn('[foodbridge-api] MongoDB disconnected — attempting to reconnect...');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[foodbridge-api] MongoDB reconnected.');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[foodbridge-api] MongoDB connection error (post-startup):', err.message);
  });
}

module.exports = connectDB;
