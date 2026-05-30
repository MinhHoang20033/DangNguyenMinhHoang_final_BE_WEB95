/* global process */
import dotenv from "dotenv";

import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { seedDefaultUsers } from "./config/seedUsers.js";

dotenv.config();

const port = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDatabase(process.env.MONGO_URI);
    await seedDefaultUsers();

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
