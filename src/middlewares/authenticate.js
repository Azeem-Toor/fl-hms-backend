import moment from "moment";
import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { getActiveSession, identityForSession } from "../modules/auth/services/auth.service.js";

export async function authenticate(req, res, next) {
  try {
    // --------------------------------------------------
    // 1. EXTRACT ACCESS TOKEN
    // --------------------------------------------------

    const header = req.get("authorization") || "";
    const match = /^Bearer\s+(\S+)$/i.exec(header);

    if (!match) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    // --------------------------------------------------
    // 2. VERIFY ACCESS JWT
    // --------------------------------------------------

    let claims;

    try {
      claims = verifyAccessToken(match[1]);
    } catch {
      throw new AppError("Invalid or expired access token", 401, "INVALID_ACCESS_TOKEN");
    }

    // --------------------------------------------------
    // 3. FETCH ACTIVE SESSION
    // --------------------------------------------------

    const session = await getActiveSession(claims.sid);
    const now = moment.utc();

    // --------------------------------------------------
    // 4. VALIDATE SESSION & TOKEN VERSION
    // --------------------------------------------------

    if (
      !session ||
      session.userId !== claims.sub ||
      session.application !== claims.application ||
      session.revokedAt !== null ||
      !session.expiresAt ||
      !moment.utc(session.expiresAt).isValid() ||
      !moment.utc(session.expiresAt).isAfter(now) ||
      session.tokenVersion !== claims.ver
    ) {
      throw new AppError("Session expired, revoked or invalidated", 401, "INVALID_SESSION");
    }

    // --------------------------------------------------
    // 5. VALIDATE USER STATUS
    // --------------------------------------------------

    if (!session.user || !session.user.isActive || session.user.deletedAt !== null) {
      throw new AppError("User account is inactive", 401, "INVALID_SESSION");
    }

    // --------------------------------------------------
    // 6. VALIDATE APPLICATION ROLE
    // --------------------------------------------------

    const hasActiveRole = session.user.userRoles?.some(
      ({ role, revokedAt }) =>
        revokedAt === null && role?.isActive === true && role.application === claims.application
    );

    if (!hasActiveRole) {
      throw new AppError("No active role for this application", 403, "APPLICATION_FORBIDDEN");
    }

    // --------------------------------------------------
    // 7. ATTACH AUTHENTICATED IDENTITY
    // --------------------------------------------------

    req.auth = {
      ...identityForSession(session),
      sessionId: session.id,
      tokenVersion: session.tokenVersion,
      jti: claims.jti,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}
