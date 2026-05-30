import mongoose from "mongoose";

export const connectDatabase = async (mongoUri) => {
  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
};
