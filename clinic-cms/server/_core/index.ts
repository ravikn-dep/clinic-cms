import "./loadEnv";
import express from "express";
import { createServer } from "http";
import net from "net";
import { sql } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  if (!process.env.JWT_SECRET) {
    console.warn("[Config] JWT_SECRET is not set. Login sessions will not work until you add it to .env");
  }
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[Config] DATABASE_URL is not set. Copy .env.example to .env and configure MySQL before using login or data features."
    );
  }

  const app = express();
  // Manus / reverse proxies terminate TLS — required for secure session cookies.
  app.set("trust proxy", 1);

  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  registerStorageProxy(app);

  // Legacy Manus OAuth paths — credential login only (/login).
  app.use("/api/oauth", (_req, res) => {
    res.redirect(302, "/login");
  });

  app.get("/api/health", async (_req, res) => {
    let database: "connected" | "unconfigured" | "error" = "unconfigured";
    let databaseError: string | undefined;

    if (!process.env.DATABASE_URL) {
      database = "unconfigured";
      databaseError = "DATABASE_URL is not set in .env";
    } else {
      try {
        const db = await getDb();
        if (!db) {
          database = "unconfigured";
          databaseError = "Could not open database connection";
        } else {
          await db.execute(sql`SELECT 1`);
          database = "connected";
        }
      } catch (error) {
        database = "error";
        databaseError =
          error instanceof Error ? error.message : "Database health check failed";
      }
    }

    res.json({
      ok: database === "connected",
      service: "clinic-cms",
      nodeEnv: process.env.NODE_ENV ?? "development",
      database,
      databaseError,
    });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Add route handler for direct login before Vite/static files
  for (const loginPath of ["/login", "/direct-login"]) {
    app.get(loginPath, (_req, res, next) => {
      next();
    });
  }
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`API health check: http://localhost:${port}/api/health`);
  });
}

startServer().catch(console.error);
