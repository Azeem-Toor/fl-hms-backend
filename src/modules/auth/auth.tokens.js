import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

// ============================================
// CONFIGURATION & VALIDATION
// ============================================

const sessionIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowedApplications = ["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"];

// Prevent refresh tokens from being accepted
// as access tokens, even beyond claim checks.
const refreshAudience = `${env.jwt.audience}:refresh`;

function validateSecret(secret, name) {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(`${name} needs at least 32 bytes from a secure random generator`);
  }
}

validateSecret(env.jwt.accessSecret, "JWT_ACCESS_SECRET");
validateSecret(env.jwt.refreshSecret, "JWT_REFRESH_SECRET");

if (env.jwt.accessSecret === env.jwt.refreshSecret) {
  throw new Error("Access and refresh JWT secrets must be different");
}

// ============================================
// ACCESS TOKEN
// ============================================


export function signAccessToken({ userId, sessionId, application, tokenVersion }) {
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    throw new Error("Invalid session token version");
  }

  return jwt.sign(
    {
      sid: sessionId,
      application,
      type: "access",
      ver: tokenVersion,
    },
    env.jwt.accessSecret,
    {
      algorithm: "HS256",
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      subject: userId,
      jwtid: randomUUID(),
      expiresIn: env.jwt.accessTtlSeconds,
    }
  );
}



export function verifyAccessToken(token) {
  const claims = jwt.verify(token, env.jwt.accessSecret, {
    algorithms: ["HS256"],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    clockTolerance: 3,
  });

  if (
    !claims ||
    typeof claims !== "object" ||
    claims.type !== "access" ||
    typeof claims.sub !== "string" ||
    typeof claims.sid !== "string" ||
    !sessionIdRegex.test(claims.sid) ||
    typeof claims.jti !== "string" ||
    !claims.jti ||
    !Number.isSafeInteger(claims.ver) ||
    claims.ver < 0 ||
    !allowedApplications.includes(claims.application)
  ) {
    throw new Error("Invalid access-token claims");
  }

  return claims;
}


// ============================================
// REFRESH TOKEN GENERATION
// ============================================

export function createRefreshToken(sessionId) {
  if (typeof sessionId !== "string" || !sessionIdRegex.test(sessionId)) {
    throw new Error("Invalid session ID");
  }

  return jwt.sign(
    {
      sid: sessionId,
      type: "refresh",
    },
    env.jwt.refreshSecret,
    {
      algorithm: "HS256",
      issuer: env.jwt.issuer,
      audience: refreshAudience,
      jwtid: randomUUID(),
      expiresIn: env.jwt.refreshTtlSeconds,
    }
  );
}

// ============================================
// REFRESH TOKEN VERIFICATION
// ============================================

export function verifyRefreshToken(token) {
  if (typeof token !== "string" || !token) {
    throw new Error("Invalid refresh token");
  }

  const claims = jwt.verify(token, env.jwt.refreshSecret, {
    algorithms: ["HS256"],
    issuer: env.jwt.issuer,
    audience: refreshAudience,
    clockTolerance: 0,
    maxAge: env.jwt.refreshTtlSeconds,
  });

  if (
    !claims ||
    typeof claims !== "object" ||
    claims.type !== "refresh" ||
    typeof claims.sid !== "string" ||
    !sessionIdRegex.test(claims.sid) ||
    typeof claims.jti !== "string" ||
    !claims.jti ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= claims.iat
  ) {
    throw new Error("Invalid refresh-token claims");
  }

  return claims;
}

// ============================================
// EXTRACT VERIFIED SESSION ID
// ============================================

export function sessionIdFromRefreshToken(token) {
  try {
    const claims = verifyRefreshToken(token);
    return claims.sid;
  } catch {
    // Invalid signature, malformed token,
    // expired token, or invalid claims.
    return null;
  }
}

// ============================================
// REFRESH TOKEN HASHING
// ============================================

export function hashRefreshToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// ============================================
// TIMING-SAFE HASH COMPARISON
// ============================================

export function refreshHashesEqual(expectedHash, givenHash) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash || "") || !/^[a-f0-9]{64}$/i.test(givenHash || "")) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(givenHash, "hex"));
}
