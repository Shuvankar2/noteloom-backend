const mongoose = require('mongoose');

// Global cache for serverless environment
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, 
      socketTimeoutMS: 45000, 
      maxPoolSize: 10
    }).then((mongoose) => {
      console.log('✅ MongoDB Atlas connected successfully (Serverless Cached)');
      return mongoose;
    }).catch(error => {
      console.error('❌ MongoDB connection error:', error);
      throw error;
    });
  }
  
  cached.conn = await cached.promise;
  return cached.conn;
};

// Handle process termination (Keep your existing events)
mongoose.connection.on('connected', () => console.log('✅ Mongoose connected to MongoDB'));
mongoose.connection.on('error', (err) => console.error('❌ Mongoose connection error:', err));
mongoose.connection.on('disconnected', () => console.log('⚠️ Mongoose disconnected'));

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('📴 MongoDB connection closed through app termination');
  process.exit(0);
});

module.exports = connectDB;