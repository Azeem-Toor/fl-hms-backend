import { randomUUID } from "node:crypto";
import moment from "moment";

import { AppError } from "../../../utils/AppError.js";
import { env } from "../../../config/env.js";
import { eligibleRoles, buildUserContext } from "../../../utils/roleContext.js";
import { verifyPassword, hashPassword } from "../../../utils/password.js";
import * as repository from "../repositories/auth.repository.js";

import {
  signAccessToken,
  createRefreshToken,
  sessionIdFromRefreshToken,
  hashRefreshToken,
  refreshHashesEqual,
} from "../auth.tokens.js";

const invalidCredentials = () =>
  new AppError("Invalid username or password", 401, "INVALID_CREDENTIALS");

const invalidSession = () => new AppError("Session invalid or expired", 401, "INVALID_SESSION");

function isActiveUser(user) {
  return Boolean(user?.isActive && !user.deletedAt && user.credential);
}

// --------------------------------------------------
// SESSION VALIDATION
// --------------------------------------------------

export function requireActiveSession(session) {
  if (
    !session ||
    session.revokedAt ||
    moment.utc(session.expiresAt).isSameOrBefore(moment.utc()) ||
    !isActiveUser(session.user) ||
    eligibleRoles(session.user, session.application).length === 0
  ) {
    throw invalidSession();
  }

  return session;
}

// --------------------------------------------------
// TOKEN RESPONSE
// --------------------------------------------------

function issuedTokens(session, refreshToken) {
  const expiresAt = moment.utc(session.expiresAt);

  return {
    accessToken: signAccessToken({
      userId: session.userId,
      sessionId: session.id,
      application: session.application,
      tokenVersion: session.tokenVersion,
    }),
    refreshToken,
    tokenType: "Bearer",
    accessExpiresIn: env.jwt.accessTtlSeconds,
    refreshExpiresIn: Math.max(0, Math.ceil(expiresAt.diff(moment.utc(), "seconds", true))),
    sessionExpiresAt: expiresAt.toISOString(),
    ...buildUserContext(session.user, session.application),
  };
}

// --------------------------------------------------
// LOGIN AUDIT
// --------------------------------------------------

async function unsuccessfulLogin(user, application, audit) {
  await repository.insertAuditLog({
    action: "LOGIN",
    outcome: "FAILURE",
    ...(user ? { targetUserId: user.id } : {}),
    application,
    ...audit,
  });
}

// --------------------------------------------------
// LOGIN
// --------------------------------------------------


export async function login({ userName, password, application }, audit = {}) {
  // --------------------------------------------------
  // 1. FIND USER WITH APPLICATION-SPECIFIC ROLES
  // --------------------------------------------------
  // get the active user and credentials for based on the username
  const user = await repository.findUserByUserName({
    filter: {
      userName: userName.trim().toLowerCase(),
      application,
    },
    view: "AUTH",
  });
  const credential = user ? await repository.findCredentialByUserId(user.id) : null;

  if (!isActiveUser(user) || !credential) {
    await verifyPassword(password, null);
    await unsuccessfulLogin(user, application, audit);
    throw invalidCredentials();
  }

  // --------------------------------------------------
  // 2. CHECK ACCOUNT LOCK
  // --------------------------------------------------

  const now = moment.utc();
  let expiredLockCleared = false;

  if (credential.lockedUntil) {
    const lockedUntil = moment.utc(credential.lockedUntil);

    if (lockedUntil.isAfter(now)) {
      throw new AppError("Account temporarily locked", 423, "ACCOUNT_LOCKED");
    }

    // Expired lock: grant a fresh set of attempts.
    await repository.updateCredentialByUserId(user.id, {
      failedAttempts: 0,
      lockedUntil: null,
    });

    expiredLockCleared = true;
  }

  // --------------------------------------------------
  // 3. VERIFY PASSWORD
  // --------------------------------------------------

  const passwordMatches = await verifyPassword(password, credential.passwordHash);

  if (!passwordMatches) {
    const counter = await repository.incrementCredentialFailedAttempts(user.id);

    if (counter.failedAttempts >= env.auth.maxFailedAttempts) {
      await repository.updateCredentialByUserId(user.id, {
        lockedUntil: moment.utc().add(env.auth.lockMinutes, "minutes").toDate(),
      });
    }

    await unsuccessfulLogin(user, application, audit);
    throw invalidCredentials();
  }

  // --------------------------------------------------
  // 4. VERIFY APPLICATION ROLES
  // --------------------------------------------------

  const roles = eligibleRoles(user, application);

  if (roles.length === 0) {
    await repository.insertAuditLog({
      action: "LOGIN",
      outcome: "DENIED",
      targetUserId: user.id,
      application,
      ...audit,
    });

    throw new AppError("No active role for the selected application", 403, "APPLICATION_FORBIDDEN");
  }

  // All active matching roles are retained.
  // Their permissions are combined by buildUserContext().

  // --------------------------------------------------
  // 5. RESET FAILED ATTEMPTS AFTER SUCCESSFUL CHECKS
  // --------------------------------------------------

  if (!expiredLockCleared && (credential.failedAttempts > 0 || credential.lockedUntil)) {
    await repository.updateCredentialByUserId(user.id, {
      failedAttempts: 0,
      lockedUntil: null,
    });
  }

  // --------------------------------------------------
  // 6. CREATE REFRESH SESSION
  // --------------------------------------------------

  const sessionId = randomUUID();
  const refreshToken = createRefreshToken(sessionId);

  const sessionExpiresAt = moment.utc().add(env.jwt.refreshTtlSeconds, "seconds").toDate();

  await repository.createSessionWithAudit(
    {
      id: sessionId,
      userId: user.id,
      roleId: null,
      application,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: sessionExpiresAt,
    },
    {
      action: "LOGIN",
      outcome: "SUCCESS",
      actorId: user.id,
      targetUserId: user.id,
      application,
      ...audit,
    }
  );

  // --------------------------------------------------
  // 7. LOAD SESSION AND RETURN TOKENS + USER CONTEXT
  // --------------------------------------------------

  const session = await getActiveSession(sessionId);

  return issuedTokens(session, refreshToken);
}


// --------------------------------------------------
// ACTIVE SESSION
// --------------------------------------------------

export async function getActiveSession(sessionId) {
  return requireActiveSession(await repository.findSessionById(sessionId));
}

export function identityForSession(session) {
  return buildUserContext(session.user, session.application);
}

// --------------------------------------------------
// REFRESH TOKEN
// --------------------------------------------------


export async function refreshTokenService({ refreshToken }, audit = {}) {
  const invalidToken = () =>
    new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");

  // 1. Verify JWT and obtain session ID.
  // This returns null for malformed, tampered or
  // expired refresh JWTs.
  const sessionId = sessionIdFromRefreshToken(refreshToken);

  if (!sessionId) {
    throw invalidToken();
  }

  // 2. Load session and current user context
  const session = await repository.findSessionById(sessionId);

  const now = new Date();

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= now ||
    !isActiveUser(session.user) ||
    eligibleRoles(session.user, session.application).length === 0
  ) {
    throw invalidToken();
  }

  // 3. Calculate hash of presented refresh token
  const presentedHash = hashRefreshToken(refreshToken);

  // Helper: invalidate the entire session when a
  // previously rotated refresh token is presented.
  async function revokeCompromisedSession() {
    await repository.revokeSessionWithAudit(
      session.id,
      session.userId,
      {
        revokedAt: new Date(),
        revokeReason: "REFRESH_TOKEN_REUSE",
      },
      {
        action: "REFRESH_TOKEN_REUSE",
        outcome: "DENIED",
        actorId: session.userId,
        targetUserId: session.userId,
        application: session.application,
        ...audit,
      }
    );
  }

  // 4. Detect reuse of an already rotated token
  if (!refreshHashesEqual(session.refreshTokenHash, presentedHash)) {
    await revokeCompromisedSession();
    throw invalidToken();
  }

  // 5. Generate the next refresh JWT
  const newRefreshToken = createRefreshToken(session.id);
  const newHash = hashRefreshToken(newRefreshToken);

  // 6. Atomically replace the old hash.
  // Repository also increments tokenVersion.
  const result = await repository.rotateRefreshTokenIfMatch(session.id, presentedHash, newHash);

  if (result.count !== 1) {
    // Another request may have rotated the token
    // after the initial session read.
    const latest = await repository.findSessionById(session.id);

    if (
      latest &&
      latest.revokedAt === null &&
      latest.expiresAt > new Date() &&
      !refreshHashesEqual(latest.refreshTokenHash, presentedHash)
    ) {
      await revokeCompromisedSession();
    }

    throw invalidToken();
  }

  // 7. Reload session AFTER version increment
  const updatedSession = await getActiveSession(session.id);

  // 8. Issue access JWT using the new tokenVersion
  return issuedTokens(updatedSession, newRefreshToken);
}


// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

export async function logout(auth, audit = {}) {
  await repository.revokeSessionWithAudit(
    auth.sessionId,
    auth.user.id,
    {
      revokedAt: moment.utc().toDate(),
      revokeReason: "LOGOUT",
    },
    {
      action: "LOGOUT",
      outcome: "SUCCESS",
      actorId: auth.user.id,
      targetUserId: auth.user.id,
      application: auth.context.application,
      ...audit,
    }
  );
}

// --------------------------------------------------
// CHANGE OWN PASSWORD
// --------------------------------------------------

export async function changeOwnPassword(auth, { currentPassword, newPassword }, audit = {}) {
  const credential = await repository.findCredentialByUserId(auth.user.id);

  if (!credential || !(await verifyPassword(currentPassword, credential.passwordHash))) {
    throw new AppError("Current password is incorrect", 400, "INCORRECT_PASSWORD");
  }

  if (await verifyPassword(newPassword, credential.passwordHash)) {
    throw new AppError("Choose a different password", 400, "PASSWORD_UNCHANGED");
  }

  const result = await repository.updateCredentialIfHashMatchesWithAudit(
    auth.user.id,
    credential.passwordHash,
    {
      passwordHash: await hashPassword(newPassword),
      updatedAt: moment.utc().toDate(),
      failedAttempts: 0,
      lockedUntil: null,
    },
    {
      action: "PASSWORD_CHANGED",
      outcome: "SUCCESS",
      actorId: auth.user.id,
      targetUserId: auth.user.id,
      sessionId:auth.sessionId,
      application: auth.context.application,
      ...audit,
    }
  );

  if (!result) {
    throw new AppError("Password changed during request. Try again", 409, "PASSWORD_CONFLICT");
  }
}

// --------------------------------------------------
// ADMIN PASSWORD RESET
// --------------------------------------------------

export async function resetStaffPassword(auth, targetUserId, newPassword, audit = {}) {
  if (auth.user.id === targetUserId) {
    throw new AppError(
      "Use the change password endpoint for yourself",
      400,
      "USE_OWN_PASSWORD_ENDPOINT"
    );
  }

  const target = await repository.findUserById(targetUserId);

  if (!target || !target.isActive || target.deletedAt) {
    throw new AppError("Staff member not found", 404, "USER_NOT_FOUND");
  }

  if (!target.credential) {
    throw new AppError("Staff credentials are missing", 409, "CREDENTIALS_MISSING");
  }

  await repository.updateCredentialWithAudit(
    targetUserId,
    {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: moment.utc().toDate(),
      failedAttempts: 0,
      lockedUntil: null,
    },
    {
      action: "PASSWORD_RESET_BY_ADMIN",
      outcome: "SUCCESS",
      actorId: auth.user.id,
      targetUserId,
      application: auth.context.application,
      ...audit,
    }
  );
}

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

export function currentUser(auth) {
  return {
    user: auth.user,
    context: auth.context,
    availableRoles: auth.availableRoles,
  };
}
