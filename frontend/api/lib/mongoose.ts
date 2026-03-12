import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// In development, explicitly load .env.local because Vercel Serverless Functions
// executed locally via `vercel dev` sometimes lose the env context.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
}

const getMongoUri = () => process.env.aqmrg_frontend_MONGODB_URI || process.env.MONGODB_URI;

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections from growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const MONGODB_URI = getMongoUri();
    if (!MONGODB_URI) {
      throw new Error('Please define the aqmrg_frontend_MONGODB_URI or MONGODB_URI environment variable');
    }

    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
