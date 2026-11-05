import "dotenv/config";

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: integer("PORT", 4000, 1, 65535),
  host: process.env.HOST || "127.0.0.1",
  logLevel: process.env.LOG_LEVEL || "info",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "256kb",
  databaseUrl: process.env.DATABASE_URL || "",
  jwt: Object.freeze({
    accessSecret: process.env.JWT_ACCESS_SECRET || "",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "",
    issuer: process.env.JWT_ISSUER || "fl-hms",
    audience: process.env.JWT_AUDIENCE || "fl-hms-client",
    accessTtlSeconds: integer("JWT_ACCESS_TTL_SECONDS", 900, 60, 28800),
    refreshTtlSeconds: integer("JWT_REFRESH_TTL_SECONDS", 86400, 3600, 604800),
  }),
  auth: Object.freeze({
    bcryptRounds: integer("AUTH_BCRYPT_ROUNDS", 12, 10, 15),
    maxFailedAttempts: integer("AUTH_MAX_FAILED_ATTEMPTS", 5, 2, 20),
    lockMinutes: integer("AUTH_LOCK_MINUTES", 15, 1, 1440),
    rateLimitWindowMinutes: integer("AUTH_RATE_LIMIT_WINDOW_MINUTES", 15, 1, 60),
    loginRateLimit: integer("AUTH_LOGIN_RATE_LIMIT", 30, 1, 1000),
    refreshRateLimit: integer("AUTH_REFRESH_RATE_LIMIT", 120, 1, 10000),
  }),
});
