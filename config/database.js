import mongoose from "mongoose";

export const connectDatabase = async (mongoUri) => {
  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
  return mongoose.connection;
};
