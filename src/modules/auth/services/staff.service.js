import { AppError } from "../../../utils/AppError.js";
import * as repository from "../repositories/staff.repository.js";
import { hashPassword } from "../../../utils/password.js";

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function ensureStaffExists(staff) {
  if (!staff) {
    throw new AppError("Staff member not found", 404, "STAFF_NOT_FOUND");
  }

  return staff;
}

function ensureActorId(actorId) {
  if (!actorId) {
    throw new AppError("Authenticated administrator ID is missing", 500, "AUTH_CONTEXT_MISSING");
  }
}

function formatStaff(staff) {
  const { userRoles, ...profile } = staff;

  return {
    ...profile,
    roles: userRoles.map(({ role, assignedAt }) => ({
      ...role,
      assignedAt,
    })),
  };
}

function isSuperAdminRole(role) {
  return role.code === "SUPER_ADMIN" && role.application === "ADMIN" && role.isActive;
}

async function validateRoles(roleIds, db) {
  const roles = await repository.findRolesByIds(roleIds, db);

  if (roles.length !== roleIds.length || roles.some((role) => !role.isActive)) {
    throw new AppError("One or more role IDs are invalid or inactive", 400, "INVALID_ROLES");
  }

  return roles;
}

async function ensureNoScheduledDuties(userId, now, roleIds, db) {
  const total = await repository.countScheduledDuties(userId, now, roleIds, db);

  if (total > 0) {
    throw new AppError(
      "Staff has ongoing or upcoming duties. Reassign or cancel them first.",
      409,
      "STAFF_HAS_SCHEDULED_DUTIES"
    );
  }
}

async function ensureAnotherSuperAdminExists(userId, db) {
  const count = await repository.countOtherSuperAdmins(userId, db);

  if (count === 0) {
    throw new AppError("Cannot remove the last active Super Admin", 409, "LAST_SUPER_ADMIN");
  }
}

function normalizeDatabaseError(error) {
  if (error?.code === "P2002") {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(",")
      : String(error.meta?.target ?? "");

    const field = target.includes("userName")
      ? "Username"
      : target.includes("email")
        ? "Email"
        : "Staff account";

    return new AppError(`${field} already exists`, 409, "STAFF_ALREADY_EXISTS");
  }

  if (error?.code === "P2025") {
    return new AppError("Staff member not found", 404, "STAFF_NOT_FOUND");
  }

  return error;
}

// --------------------------------------------------
// CREATE STAFF
// --------------------------------------------------

export async function createStaff(data, actorId) {
  ensureActorId(actorId);

  const { password, roleIds, ...profile } = data;

  const passwordHash = await hashPassword(password);

  try {
    const staff = await repository.withTransaction(async (db) => {
      await validateRoles(roleIds, db);

      const created = await repository.createStaff(
        {
          profile,
          passwordHash,
          roleIds,
        },
        db
      );

      await repository.createAuditLog(
        {
          actorId,
          targetUserId: created.id,
          action: "STAFF_CREATED",
          metadata: {
            roleIds,
          },
        },
        db
      );

      return created;
    });

    return {
      success: true,
      data: formatStaff(staff),
    };
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

// --------------------------------------------------
// LIST STAFF
// --------------------------------------------------

export async function listStaff(query) {
  const { search, application, roleId, isActive, sortBy = "createdAt", sortOrder = "desc" } = query;

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(skip)
  ) {
    throw new AppError("Invalid pagination parameters", 400, "INVALID_PAGINATION");
  }

  const { staff, total } = await repository.findStaff({
    skip,
    take: limit,
    search: search || undefined,
    application,
    roleId,
    isActive,
    sortBy,
    sortOrder,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data: staff.map(formatStaff),

    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

// --------------------------------------------------
// GET STAFF BY ID
// --------------------------------------------------

export async function getStaffById(id) {
  const staff = ensureStaffExists(await repository.findStaffById(id));

  return {
    success: true,
    data: formatStaff(staff),
  };
}

// --------------------------------------------------
// UPDATE STAFF
// --------------------------------------------------

export async function updateStaff(id, data, actorId) {
  ensureActorId(actorId);

  const { roleIds, isActive, ...profile } = data;

  try {
    const updated = await repository.withTransaction(async (db) => {
      const current = ensureStaffExists(await repository.findStaffById(id, db));

      const currentRoleIds = current.userRoles.map(({ role }) => role.id);

      const currentRoleIdSet = new Set(currentRoleIds);

      let requestedRoles = [];
      let rolesToRevoke = [];
      let rolesToGrant = [];

      // ------------------------------------------
      // 1. VALIDATE ROLE CHANGES
      // ------------------------------------------

      if (roleIds !== undefined) {
        requestedRoles = await validateRoles(roleIds, db);

        const requestedIdSet = new Set(roleIds);

        rolesToRevoke = currentRoleIds.filter((roleId) => !requestedIdSet.has(roleId));

        rolesToGrant = roleIds.filter((roleId) => !currentRoleIdSet.has(roleId));
      }

      const rolesChanged = rolesToRevoke.length > 0 || rolesToGrant.length > 0;

      // ------------------------------------------
      // 2. DETERMINE FINAL STATUS
      // ------------------------------------------

      const nextIsActive = isActive === undefined ? current.isActive : isActive;

      const statusChanged = nextIsActive !== current.isActive;

      const deactivating = current.isActive && !nextIsActive;

      // ------------------------------------------
      // 3. PROTECT LAST SUPER ADMIN
      // ------------------------------------------

      const currentlySuperAdmin =
        current.isActive && current.userRoles.some(({ role }) => isSuperAdminRole(role));

      const retainsSuperAdminRole =
        roleIds === undefined
          ? current.userRoles.some(({ role }) => isSuperAdminRole(role))
          : requestedRoles.some(isSuperAdminRole);

      if (currentlySuperAdmin && !(nextIsActive && retainsSuperAdminRole)) {
        await ensureAnotherSuperAdminExists(id, db);
      }

      // ------------------------------------------
      // 4. VALIDATE SCHEDULED DUTIES
      // ------------------------------------------

      const now = new Date();

      if (deactivating) {
        // Deactivation affects all staff duties.
        await ensureNoScheduledDuties(id, now, null, db);
      } else if (rolesToRevoke.length > 0) {
        // Role removal affects duties of those roles.
        await ensureNoScheduledDuties(id, now, rolesToRevoke, db);
      }

      // ------------------------------------------
      // 5. UPDATE STAFF DETAILS
      // ------------------------------------------

      const profileChanged = Object.keys(profile).length > 0;

      if (profileChanged) {
        await repository.updateStaffProfile(id, profile, db);
      }

      // ------------------------------------------
      // 6. UPDATE ACTIVE STATUS
      // ------------------------------------------

      if (statusChanged) {
        await repository.setStaffStatus(id, nextIsActive, db);
      }

      // ------------------------------------------
      // 7. SYNCHRONIZE ROLES
      // ------------------------------------------

      if (rolesChanged) {
        await repository.revokeUserRoles(id, rolesToRevoke, now, db);

        await repository.assignUserRoles(id, rolesToGrant, now, db);
      }

      // ------------------------------------------
      // 8. REVOKE SESSIONS WHEN NEEDED
      // ------------------------------------------

      if (rolesChanged || deactivating) {
        await repository.revokeStaffSessions(
          id,
          deactivating ? "STAFF_DEACTIVATED" : "ROLES_CHANGED",
          now,
          db
        );
      }

      // ------------------------------------------
      // 9. AUDIT CHANGES
      // ------------------------------------------

      const changedFields = [
        ...Object.keys(profile),
        ...(rolesChanged ? ["roleIds"] : []),
        ...(statusChanged ? ["isActive"] : []),
      ];

      if (changedFields.length > 0) {
        await repository.createAuditLog(
          {
            actorId,
            targetUserId: id,
            action: "STAFF_UPDATED",
            metadata: {
              changedFields,
              rolesGranted: rolesToGrant,
              rolesRevoked: rolesToRevoke,
            },
          },
          db
        );
      }

      // ------------------------------------------
      // 10. RETURN UPDATED RECORD
      // ------------------------------------------

      return repository.findStaffById(id, db);
    });

    return {
      success: true,
      data: formatStaff(updated),
    };
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

// --------------------------------------------------
// RESET STAFF PASSWORD
// --------------------------------------------------

export async function resetStaffPassword(id, password, actorId) {
  ensureActorId(actorId);

  const passwordHash = await hashPassword(password);

  try {
    await repository.withTransaction(async (db) => {
      ensureStaffExists(await repository.findStaffById(id, db));

      await repository.updateStaffPassword(id, passwordHash, db);

      const now = new Date();

      await repository.revokeStaffSessions(id, "PASSWORD_RESET", now, db);

      await repository.createAuditLog(
        {
          actorId,
          targetUserId: id,
          action: "STAFF_PASSWORD_RESET",
          metadata: {
            sessionsRevoked: true,
          },
        },
        db
      );
    });

    return {
      success: true,
      message: "Staff password reset successfully",
    };
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

// --------------------------------------------------
// SOFT DELETE STAFF
// --------------------------------------------------

export async function deleteStaff(id, actorId) {
  ensureActorId(actorId);

  try {
    await repository.withTransaction(async (db) => {
      const staff = ensureStaffExists(await repository.findStaffById(id, db));

      // ------------------------------------------
      // 1. PROTECT LAST SUPER ADMIN
      // ------------------------------------------

      const isActiveSuperAdmin =
        staff.isActive && staff.userRoles.some(({ role }) => isSuperAdminRole(role));

      if (isActiveSuperAdmin) {
        await ensureAnotherSuperAdminExists(id, db);
      }

      const now = new Date();

      // ------------------------------------------
      // 2. CHECK DUTIES
      // ------------------------------------------

      await ensureNoScheduledDuties(id, now, null, db);

      // ------------------------------------------
      // 3. SOFT DELETE
      // ------------------------------------------

      await repository.softDeleteStaff(id, now, db);

      // ------------------------------------------
      // 4. REVOKE ROLE ASSIGNMENTS
      // ------------------------------------------

      const activeRoleIds = staff.userRoles.map(({ role }) => role.id);

      await repository.revokeUserRoles(id, activeRoleIds, now, db);

      // ------------------------------------------
      // 5. REVOKE SESSIONS
      // ------------------------------------------

      await repository.revokeStaffSessions(id, "STAFF_DELETED", now, db);

      // ------------------------------------------
      // 6. AUDIT
      // ------------------------------------------

      await repository.createAuditLog(
        {
          actorId,
          targetUserId: id,
          action: "STAFF_DELETED",
          metadata: {
            softDelete: true,
          },
        },
        db
      );
    });

    return {
      success: true,
      message: "Staff deleted successfully",
    };
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}
