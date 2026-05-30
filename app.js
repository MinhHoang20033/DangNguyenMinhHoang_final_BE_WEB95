import cors from "cors";
import express from "express";

import { connectDatabase } from "./config/database.js";
import { seedDefaultUsers } from "./config/seedUsers.js";
import authRoutes from "./routes/auth.js";
import employeeRoutes from "./routes/employees.js";
import partnerRoutes from "./routes/partners.js";
import projectRoutes from "./routes/projects.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { getUploadRoot } from "./middleware/upload.js";

const app = express();

const clientOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: clientOrigins,
    credentials: true,
  }),
);

let readyPromise = null;

const ensureReady = async (req, res, next) => {
  try {
    if (!readyPromise) {
      readyPromise = (async () => {
        await connectDatabase(process.env.MONGO_URI);
        await seedDefaultUsers();
      })();
    }
    await readyPromise;
    next();
  } catch (error) {
    next(error);
  }
};

if (process.env.VERCEL) {
  app.use(ensureReady);
}
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(getUploadRoot()));

app.get("/", (req, res) => {
  res.send("API running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/projects", projectRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
