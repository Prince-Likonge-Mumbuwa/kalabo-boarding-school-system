/**
 * Assembles the Express application: who may call it (CORS), the route
 * groups, then error handling. Kept separate from index.ts so tests can
 * create the app without opening a network port.
 */
import cors from "cors";
import express from "express";
import type { Services } from "./container.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { superAdminRoutes } from "./routes/superadmin.js";
import { teacherRoutes } from "./routes/teacher.js";

export function createApp(services: Services) {
  const app = express();
  app.disable("x-powered-by");
  // Only the school app's own address may call this API from a browser.
  app.use(cors({ origin: services.config.clientOrigins }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req, res) => {
    const writer = services.generation.writer as { load?: { running: number; waiting: number; limit: number } };
    res.json({ ok: true, superAdminCreated: await services.superAdmin.exists(), writer: writer.load ?? null });
  });
  app.use("/api/superadmin", superAdminRoutes(services));
  app.use("/api/teacher", teacherRoutes(services));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
