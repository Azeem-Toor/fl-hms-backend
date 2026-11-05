import moment from "moment";
import { prisma } from "../../../config/prisma.js";

// --------------------------------------------------
// IDENTITY PROJECTION
// --------------------------------------------------


// USER PROJECTIONS
// --------------------------------------------------

const USER_VIEWS = Object.freeze({
  BASIC: "BASIC",
  PROFILE: "PROFILE",
  AUTH: "AUTH",
});

// Default projection: minimal user information
const basicSelect = {
  id: true,
  userName: true,
};

// Profile projection: standard staff information
const profileSelect = {
  ...basicSelect,
  fullName: true,
  email: true,
  phone: true,
  designation: true,
  isActive: true,
  deletedAt: true,
};

// Authentication roles projection
function buildRolesSelect(application = null) {
  return {
    where: {
      revokedAt: null,
      role: {
        is: {
          isActive: true,
          ...(application && { application }),
        },
      },
    },

    select: {
      revokedAt: true,
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          application: true,
          isActive: true,

          permissions: {
            ...(application && {
              where: {
                permission: {
                  is: { application },
                },
              },
            }),

            select: {
              permission: {
                select: {
                  code: true,
                  application: true,
                },
              },
            },
          },
        },
      },
    },
  };
}

// --------------------------------------------------
// PROJECTION BUILDER
// --------------------------------------------------

function buildUserSelect(view = USER_VIEWS.BASIC, filter = {}) {
  switch (view) {
    case USER_VIEWS.BASIC:
      return basicSelect;

    case USER_VIEWS.PROFILE:
      return profileSelect;

    case USER_VIEWS.AUTH:
      return {
        ...profileSelect,

        // Only check credential existence here.
        // Password hash is retrieved separately.
        credential: {
          select: { id: true },
        },

        userRoles: buildRolesSelect(filter.application),
      };

    default:
      throw new Error(`Unsupported user view: ${view}`);
  }
}

// --------------------------------------------------
// USER QUERIES
// --------------------------------------------------

export function findUserByUserName({
  filter = {},
  view = USER_VIEWS.BASIC,
} = {}) {
  const { userName } = filter;

  if (typeof userName !== "string" || !userName.trim()) {
    throw new TypeError("userName is required");
  }

  return prisma.user.findUnique({
    where: { userName },
    select: buildUserSelect(view, filter),
  });
}

export function findUserById(
  userId,
  { view = USER_VIEWS.BASIC, application = null } = {}
) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: buildUserSelect(view, { application }),
  });
}

// --------------------------------------------------
// SESSION QUERY
// --------------------------------------------------

// A session already belongs to an application.
// Load all active roles; the service-level roleContext
// selects roles matching session.application.
export function findSessionById(sessionId) {
  return prisma.refreshSession.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: buildUserSelect(USER_VIEWS.AUTH),
      },
    },
  });
}




// --------------------------------------------------
// CREDENTIAL MANAGEMENT
// --------------------------------------------------

export function findCredentialByUserId(userId) {
  return prisma.userCredential.findUnique({
    where: { userId },
  });
}

export function updateCredentialByUserId(userId, data) {
  return prisma.userCredential.update({
    where: { userId },
    data,
  });
}

export function incrementCredentialFailedAttempts(userId) {
  return prisma.userCredential.update({
    where: { userId },
    data: {
      failedAttempts: { increment: 1 },
    },
    select: {
      failedAttempts: true,
    },
  });
}



// --------------------------------------------------
// AUDIT LOGGING
// --------------------------------------------------

export function insertAuditLog(data) {
  return prisma.authAuditLog.create({
    data,
  });
}

// --------------------------------------------------
// SESSION CREATION
// --------------------------------------------------

export function createSessionWithAudit(sessionData, auditData) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.refreshSession.create({
      data: sessionData,
    });

    await tx.authAuditLog.create({
      data: {
        ...auditData,
        sessionId: session.id,
      },
    });

    return session;
  });
}

// --------------------------------------------------
// REFRESH TOKEN ROTATION
// --------------------------------------------------

export function rotateRefreshTokenIfMatch(sessionId, oldHash, newHash) {
  const now = moment.utc().toDate();

  return prisma.refreshSession.updateMany({
    where: {
      id: sessionId,
      refreshTokenHash: oldHash,
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      refreshTokenHash: newHash,
      tokenVersion: { increment: 1 },
      lastUsedAt: now,
    },
  });
}

// --------------------------------------------------
// SESSION REVOCATION
// --------------------------------------------------

export function revokeSessionWithAudit(sessionId, userId, revocationData, auditData) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.refreshSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: revocationData,
    });

    if (result.count) {
      await tx.authAuditLog.create({
        data: {
          ...auditData,
          sessionId,
        },
      });
    }

    return result.count;
  });
}

// --------------------------------------------------
// PASSWORD UPDATE - COMPARE AND SET
// --------------------------------------------------

// Prevents concurrent password changes using a stale hash.

export function updateCredentialIfHashMatchesWithAudit(userId, currentHash, data, auditData) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.userCredential.updateMany({
      where: {
        userId,
        passwordHash: currentHash,
      },
      data,
    });

    if (changed.count) {
      const now = new Date();

      // Revoke every active session for this user.
      await tx.refreshSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: "PASSWORD_CHANGED",
        },
      });

      await tx.authAuditLog.create({
        data: auditData,
      });
    }

    return changed.count;
  });
}


// --------------------------------------------------
// ADMIN PASSWORD RESET
// --------------------------------------------------


export function updateCredentialWithAudit(userId, data, auditData) {
  return prisma.$transaction(async (tx) => {
    await tx.userCredential.update({
      where: { userId },
      data,
    });

    // Immediately invalidate all existing sessions.
    await tx.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: "ADMIN_PASSWORD_RESET",
      },
    });

    await tx.authAuditLog.create({
      data: auditData,
    });
  });
}




export function findAccessSessionById(sessionId, application) {
  return prisma.refreshSession.findUnique({
    where: { id: sessionId },

    select: {
      id: true,
      userId: true,
      application: true,
      tokenVersion: true,
      expiresAt: true,
      revokedAt: true,

      user: {
        select: {
          id: true,
          isActive: true,
          deletedAt: true,

          userRoles: {
            where: {
              revokedAt: null,
              role: {
                is: {
                  isActive: true,
                  application,
                },
              },
            },
            select: {
              id: true,
            },
            take: 1,
          },
        },
      },
    },
  });
}
