import cors from "cors";
import express from "express";

import authRoutes from "./routes/auth.js";
import employeeRoutes from "./routes/employees.js";
import partnerRoutes from "./routes/partners.js";
import projectRoutes from "./routes/projects.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static("uploads"));

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
