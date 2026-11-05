import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";

import { requestLogger } from "./middlewares/requestLogger.js";
import { responseFormatter } from "./middlewares/responseFormatter.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";

import apiRoutes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");

// Global middleware
app.use(requestLogger);
app.use(helmet());
app.use(responseFormatter);

// Prevent caching sensitive API responses
app.use("/api/v1", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Request body parsing and size limit
app.use(
  express.json({
    limit: env.jsonBodyLimit,
    strict: true,
  })
);

// Health check
app.get("/health", (req, res) => {
  return res.success({ status: "healthy" }, "HMS API is running");
});

// All module routes
app.use("/api/v1", apiRoutes);

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
