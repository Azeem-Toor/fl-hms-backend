

import { prisma } from "../../../config/prisma.js";


// --------------------------------------------------
// REPOSITORY ERRORS
// --------------------------------------------------

export class RoleRepositoryError extends Error {
  constructor(code, cause) {
    super("Role persistence operation failed", { cause });
    this.name = "RoleRepositoryError";
    this.code = code;
  }
}

// Translate database-specific errors into
// repository-level errors.
function handleDatabaseError(error) {
  const errorCodes = {
    P2002: "UNIQUE_CONSTRAINT",
    P2003: "FOREIGN_KEY_CONSTRAINT",
    P2014: "FOREIGN_KEY_CONSTRAINT",
    P2025: "RECORD_NOT_FOUND",
  };

  const code = errorCodes[error?.code];

  if (code) {
    throw new RoleRepositoryError(code, error);
  }

  throw error;
}

// --------------------------------------------------
// ROLE PROJECTIONS
// --------------------------------------------------

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  application: true,
  isSystem: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,

  permissions: {
    select: {
      permissionId: true,
    },
    orderBy: {
      permissionId: "asc",
    },
  },
};

// Keep the response shape from the dummy service.
// Do not expose Prisma relation structures.
function mapRole(record) {
  if (!record) return null;

  const { permissions, ...role } = record;

  return {
    ...role,
    permissionIds: permissions.map((p) => p.permissionId),
  };
}

// --------------------------------------------------
// FIND ROLE BY ID
// --------------------------------------------------

export async function findRoleById(id) {
  const record = await prisma.role.findUnique({
    where: { id },
    select: roleSelect,
  });

  return mapRole(record);
}

// --------------------------------------------------
// FIND ROLE BY UNIQUE CODE
// --------------------------------------------------

export function findRoleByCode(code) {
  return prisma.role.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
    },
  });
}

// --------------------------------------------------
// FIND ROLE NAMES WITHIN APPLICATION
// --------------------------------------------------

// The service handles the name uniqueness policy.
// This method simply returns candidate records.
export function findRoleNamesByApplication(application) {
  return prisma.role.findMany({
    where: { application },
    select: {
      id: true,
      name: true,
    },
  });
}

// --------------------------------------------------
// FIND PERMISSIONS BY IDS
// --------------------------------------------------

export function findPermissionsByIds(ids) {
  if (ids.length === 0) return Promise.resolve([]);

  return prisma.permission.findMany({
    where: {
      id: { in: ids },
    },
    select: {
      id: true,
      application: true,
    },
  });
}

// --------------------------------------------------
// CREATE ROLE
// --------------------------------------------------

export async function insertRole(data) {
  const { permissionIds, ...roleData } = data;

  try {
    const record = await prisma.role.create({
      data: {
        ...roleData,

        ...(permissionIds.length > 0 && {
          permissions: {
            create: permissionIds.map((permissionId) => ({
              permission: {
                connect: { id: permissionId },
              },
            })),
          },
        }),
      },
      select: roleSelect,
    });

    return mapRole(record);
  } catch (error) {
    handleDatabaseError(error);
  }
}

// --------------------------------------------------
// LIST ROLES WITH PAGINATION
// --------------------------------------------------

export async function findRoles({ skip, take, search, application, isActive }) {
  const where = {
    ...(application && { application }),

    ...(typeof isActive === "boolean" && {
      isActive,
    }),

    ...(search && {
      OR: [{ name: { contains: search } }, { code: { contains: search } }],
    }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.role.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: roleSelect,
    }),

    prisma.role.count({ where }),
  ]);

  return {
    data: records.map(mapRole),
    total,
  };
}

// --------------------------------------------------
// UPDATE ROLE
// --------------------------------------------------

// Only persistence operations happen here.
// Permission replacement is atomic.
export async function updateRoleById(id, data) {
  const { permissionIds, ...roleData } = data;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: roleData,
      });

      if (permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({
          where: { roleId: id },
        });

        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({
              roleId: id,
              permissionId,
            })),
          });
        }
      }

      const record = await tx.role.findUnique({
        where: { id },
        select: roleSelect,
      });

      return mapRole(record);
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

// --------------------------------------------------
// COUNT ROLE REFERENCES
// --------------------------------------------------

// Includes historical user-role assignments.
// Even revoked assignments still reference the role.
export async function countRoleReferences(roleId) {
  const [userRoles, duties, sessions] = await prisma.$transaction([
    prisma.userRole.count({
      where: { roleId },
    }),

    prisma.duty.count({
      where: { roleId },
    }),

    prisma.refreshSession.count({
      where: { roleId },
    }),
  ]);

  return {
    userRoles,
    duties,
    sessions,
  };
}

// --------------------------------------------------
// DELETE ROLE
// --------------------------------------------------

// RolePermission has onDelete: Restrict.
// Its rows must be deleted before the role.
//
// Foreign keys on UserRole, Duty and RefreshSession
// prevent deletion of roles still being referenced.
export async function removeRoleById(id) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });

      await tx.role.delete({
        where: { id },
      });
    });

    return true;
  } catch (error) {
    handleDatabaseError(error);
  }
}
