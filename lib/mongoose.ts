import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;

/* eslint-disable no-var */
declare global {
  var mongooseConn:
    | {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
      }
    | undefined;
}
  /* eslint-enable no-var */

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable.");
}

if (!MONGODB_DB) {
  throw new Error("Please define the MONGODB_DB environment variable.");
}

const cached = global.mongooseConn ?? { conn: null, promise: null };
global.mongooseConn = cached;

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
