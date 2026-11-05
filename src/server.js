import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase, disconnectDatabase } from "./config/prisma.js";

const SHUTDOWN_TIMEOUT = 30_000;

let server;
let isShuttingDown = false;

async function start() {
  try {
    await connectDatabase();

    logger.info("SQLite database connected");

    server = app.listen(env.port, env.host, () => {
      const host = ["0.0.0.0", "::"].includes(env.host) ? "localhost" : env.host;

      console.log(`
  🚀 FL-HMS Backend Running

  ➜ Local:  http://${host}:${env.port}
  ➜ Health: http://${host}:${env.port}/health
  ➜ Database: SQLite Connected
  ➜ Environment: ${env.nodeEnv}
      `);
    });

    server.on("error", async (err) => {
      logger.fatal({ code: err.code, type: err.name }, "HTTP server error");

      process.exitCode = 1;
      await disconnectDatabase();
    });
  } catch (err) {
    logger.fatal({ code: err.code, type: err.name }, "Failed to start FL-HMS");

    process.exitCode = 1;
    await disconnectDatabase().catch(() => {});
  }
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Graceful shutdown initiated");

  const timeout = setTimeout(() => {
    logger.error("Shutdown timeout exceeded");
    server?.closeAllConnections?.();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });

        server.closeIdleConnections?.();
      });
    }

    await disconnectDatabase();

    logger.info("HTTP server and database disconnected");
  } catch (err) {
    logger.error({ code: err.code, type: err.name }, "Shutdown failed");
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

start();
