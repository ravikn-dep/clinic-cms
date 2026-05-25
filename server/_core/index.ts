import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Bypass OAuth for direct login routes and staff subdomain
  app.use((req, res, next) => {
    const isStaffSubdomain = req.hostname?.startsWith('staff.') || req.hostname?.includes('staff-');
    if (req.path === "/direct-login" || req.path === "/login" || req.path.startsWith("/api/trpc") || isStaffSubdomain) {
      // Skip OAuth middleware for these routes
      return next();
    }
    next();
  });

  // Staff subdomain routing - redirect to staff-consultant-login
  app.use((req, res, next) => {
    const isStaffSubdomain = req.hostname?.startsWith('staff.') || req.hostname?.includes('staff-');
    if (isStaffSubdomain && req.path === '/') {
      return res.redirect('/staff-consultant-login');
    }
    // Log staff access for analytics
    if (isStaffSubdomain || req.path === '/staff-consultant-login' || req.path === '/staff-login') {
      console.log(`[Staff Access] ${req.method} ${req.path} from ${req.hostname} at ${new Date().toISOString()}`);
    }
    next();
  });
  
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Add route handlers for login pages before Vite/static files
  app.get("/direct-login", (req, res, next) => {
    // Serve the app for direct login route
    next();
  });
  
  app.get("/staff-login", (req, res, next) => {
    // Serve the app for staff login route
    next();
  });
  
  app.get("/staff-consultant-login", (req, res, next) => {
    // Serve the app for staff consultant login route
    next();
  });
  
  app.get("/password-login", (req, res, next) => {
    // Serve the app for password login route
    next();
  });
  
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

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
