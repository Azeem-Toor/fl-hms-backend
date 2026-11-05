import { prisma } from "../../../config/prisma.js";

// --------------------------------------------------
// SHARED SELECT
// --------------------------------------------------

const staffSelect = {
  id: true,
  userName: true,
  fullName: true,
  email: true,
  phone: true,
  address: true,
  designation: true,
  salaryMinorUnits: true,
  joiningDate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,

  userRoles: {
    where: {
      revokedAt: null,
    },
    select: {
      assignedAt: true,
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          application: true,
          isActive: true,
        },
      },
    },
    orderBy: {
      assignedAt: "asc",
    },
  },
};

// --------------------------------------------------
// TRANSACTION
// --------------------------------------------------

export function withTransaction(callback) {
  return prisma.$transaction(callback);
}

// --------------------------------------------------
// CREATE STAFF
// --------------------------------------------------

export async function createStaff({ profile, passwordHash, roleIds }, db = prisma) {
  return db.user.create({
    data: {
      ...profile,

      credential: {
        create: {
          passwordHash,
        },
      },

      userRoles: {
        create: roleIds.map((roleId) => ({
          role: {
            connect: { id: roleId },
          },
        })),
      },
    },
    select: staffSelect,
  });
}

// --------------------------------------------------
// LIST STAFF
// --------------------------------------------------

export async function findStaff({
  skip,
  take,
  search,
  application,
  roleId,
  isActive,
  sortBy,
  sortOrder,
}) {
  const where = {
    deletedAt: null,

    ...(isActive !== undefined && { isActive }),

    ...(search && {
      OR: [
        { userName: { contains: search } },
        { fullName: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ],
    }),

    ...((application || roleId) && {
      userRoles: {
        some: {
          revokedAt: null,
          role: {
            isActive: true,
            ...(application && { application }),
            ...(roleId && { id: roleId }),
          },
        },
      },
    }),
  };

  const [staff, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take,
      select: staffSelect,
      orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
    }),

    prisma.user.count({ where }),
  ]);

  return { staff, total };
}

// --------------------------------------------------
// FIND BY ID
// --------------------------------------------------

export async function findStaffById(id, db = prisma) {
  return db.user.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: staffSelect,
  });
}

// --------------------------------------------------
// UPDATE PROFILE
// --------------------------------------------------

export async function updateStaffProfile(id, profile, db = prisma) {
  return db.user.update({
    where: { id },
    data: profile,
  });
}

// --------------------------------------------------
// UPDATE STATUS
// --------------------------------------------------

export async function setStaffStatus(id, isActive, db = prisma) {
  return db.user.update({
    where: { id },
    data: { isActive },
  });
}

// --------------------------------------------------
// FIND ROLES
// --------------------------------------------------

export async function findRolesByIds(roleIds, db = prisma) {
  if (roleIds.length === 0) return [];

  return db.role.findMany({
    where: {
      id: { in: roleIds },
    },
    select: {
      id: true,
      code: true,
      application: true,
      isActive: true,
    },
  });
}

// --------------------------------------------------
// REVOKE USER ROLES
// --------------------------------------------------

export async function revokeUserRoles(userId, roleIds, revokedAt, db = prisma) {
  if (roleIds.length === 0) return;

  return db.userRole.updateMany({
    where: {
      userId,
      roleId: { in: roleIds },
      revokedAt: null,
    },
    data: {
      revokedAt,
    },
  });
}

// --------------------------------------------------
// ASSIGN / REACTIVATE USER ROLES
// --------------------------------------------------

export async function assignUserRoles(userId, roleIds, assignedAt, db = prisma) {
  for (const roleId of roleIds) {
    await db.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },

      create: {
        userId,
        roleId,
        assignedAt,
      },

      update: {
        revokedAt: null,
        assignedAt,
      },
    });
  }
}

// --------------------------------------------------
// COUNT ONGOING / UPCOMING DUTIES
// --------------------------------------------------

export async function countScheduledDuties(userId, now, roleIds = null, db = prisma) {
  return db.duty.count({
    where: {
      userId,
      status: "ASSIGNED",
      endsAt: { gt: now },

      roster: {
        is: {
          status: {
            in: ["DRAFT", "PUBLISHED"],
          },
        },
      },

      ...(roleIds !== null && {
        roleId: { in: roleIds },
      }),
    },
  });
}

// --------------------------------------------------
// COUNT OTHER ACTIVE SUPER ADMINS
// --------------------------------------------------

export async function countOtherSuperAdmins(excludedUserId, db = prisma) {
  return db.user.count({
    where: {
      id: { not: excludedUserId },
      isActive: true,
      deletedAt: null,

      userRoles: {
        some: {
          revokedAt: null,

          role: {
            code: "SUPER_ADMIN",
            application: "ADMIN",
            isActive: true,
          },
        },
      },
    },
  });
}

// --------------------------------------------------
// REVOKE REFRESH SESSIONS
// --------------------------------------------------

export async function revokeStaffSessions(userId, reason, revokedAt, db = prisma) {
  return db.refreshSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt,
      revokeReason: reason,
    },
  });
}

// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------

export async function updateStaffPassword(userId, passwordHash, db = prisma) {
  return db.userCredential.upsert({
    where: { userId },

    create: {
      userId,
      passwordHash,
    },

    update: {
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
}

// --------------------------------------------------
// SOFT DELETE
// --------------------------------------------------

export async function softDeleteStaff(id, deletedAt, db = prisma) {
  return db.user.update({
    where: { id },
    data: {
      isActive: false,
      deletedAt,
    },
  });
}

// --------------------------------------------------
// AUTH AUDIT LOG
// --------------------------------------------------

export async function createAuditLog({ actorId, targetUserId, action, metadata }, db = prisma) {
  return db.authAuditLog.create({
    data: {
      actorId,
      targetUserId,
      action,
      outcome: "SUCCESS",
      application: "ADMIN",
      metadata,
    },
  });
}
