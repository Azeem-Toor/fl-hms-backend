import moment from "moment";
import { AppError } from "../../../utils/AppError.js";
import * as rolesRepository from "../repositories/roles.repository.js";

const applications = ["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"];

// --------------------------------------------------
// BUSINESS HELPERS
// --------------------------------------------------

function validatePermissionIds(ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw new AppError("Invalid permission IDs", 400, "INVALID_PERMISSIONS");
  }

  return [...new Set(ids)];
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

// Translate repository-level failures into API errors.
// No Prisma error codes appear in this layer.
function handleRepositoryError(error, operation) {
  if (error?.name !== "RoleRepositoryError") {
    throw error;
  }

  switch (error.code) {
    case "UNIQUE_CONSTRAINT":
      throw new AppError("Role already exists", 409, "ROLE_EXISTS");

    case "RECORD_NOT_FOUND":
      if (operation === "create") {
        throw new AppError("One or more permissions do not exist", 400, "INVALID_PERMISSIONS");
      }

      throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");

    case "FOREIGN_KEY_CONSTRAINT":
      if (operation === "delete") {
        throw new AppError(
          "Role is referenced by other records. Deactivate it instead.",
          409,
          "ROLE_IN_USE"
        );
      }

      throw new AppError("Invalid permission references", 400, "INVALID_PERMISSIONS");

    default:
      throw error;
  }
}

// --------------------------------------------------
// SERVICE FACTORY (DEPENDENCY INJECTION)
// --------------------------------------------------

export function createRolesService(repository) {
  // --------------------------------------------------
  // FIND ROLE OR THROW
  // --------------------------------------------------

  async function getRoleOrThrow(id) {
    const role = await repository.findRoleById(id);

    if (!role) {
      throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");
    }

    return role;
  }

  // --------------------------------------------------
  // VALIDATE PERMISSION OWNERSHIP
  // --------------------------------------------------

  async function ensureValidPermissions(permissionIds, application) {
    if (permissionIds.length === 0) return;

    const permissions = await repository.findPermissionsByIds(permissionIds);

    if (permissions.length !== permissionIds.length) {
      throw new AppError("One or more permissions do not exist", 400, "INVALID_PERMISSIONS");
    }

    const invalid = permissions.some((permission) => permission.application !== application);

    if (invalid) {
      throw new AppError(
        "Permissions must belong to the same application as the role",
        400,
        "PERMISSION_APPLICATION_MISMATCH"
      );
    }
  }

  // --------------------------------------------------
  // VALIDATE ROLE NAME UNIQUENESS
  // --------------------------------------------------

  async function ensureUniqueRoleName(name, application, excludeId = null) {
    const names = await repository.findRoleNamesByApplication(application);

    const normalized = normalizeName(name);

    const duplicate = names.some(
      (role) => role.id !== excludeId && normalizeName(role.name) === normalized
    );

    if (duplicate) {
      throw new AppError("Role name already exists in this application", 409, "ROLE_EXISTS");
    }
  }

  // --------------------------------------------------
  // CREATE ROLE
  // --------------------------------------------------

  async function createRole(data) {
    const { code, name, description, application, permissionIds = [] } = data;

    if (
      typeof code !== "string" ||
      !code.trim() ||
      typeof name !== "string" ||
      !name.trim() ||
      !applications.includes(application)
    ) {
      throw new AppError("Invalid role details", 400, "INVALID_ROLE");
    }

    if (data.isSystem !== undefined || data.isActive !== undefined) {
      throw new AppError(
        "Role status and system flags cannot be set during creation",
        400,
        "INVALID_ROLE"
      );
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();
    const ids = validatePermissionIds(permissionIds);

    // 1. Check unique role code
    const existingCode = await repository.findRoleByCode(normalizedCode);

    if (existingCode) {
      throw new AppError("Role code already exists", 409, "ROLE_EXISTS");
    }

    // 2. Check name uniqueness within application
    await ensureUniqueRoleName(normalizedName, application);

    // 3. Validate permission ownership
    await ensureValidPermissions(ids, application);

    // 4. Persist role and permissions atomically
    try {
      return await repository.insertRole({
        code: normalizedCode,
        name: normalizedName,
        description: description ?? null,
        application,
        isSystem: false,
        isActive: true,
        permissionIds: ids,
      });
    } catch (error) {
      handleRepositoryError(error, "create");
    }
  }

  // --------------------------------------------------
  // LIST ROLES WITH PAGINATION
  // --------------------------------------------------

  async function listRoles({ page = 1, limit = 10, search, application, isActive } = {}) {
    page = Number(page);
    limit = Number(limit);

    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      throw new AppError("Invalid pagination", 400, "INVALID_PAGINATION");
    }

    if (application !== undefined && !applications.includes(application)) {
      throw new AppError("Invalid application", 400, "INVALID_APPLICATION");
    }

    let activeFilter;

    if (isActive !== undefined) {
      if (isActive !== "true" && isActive !== "false" && typeof isActive !== "boolean") {
        throw new AppError("Invalid isActive filter", 400, "INVALID_FILTER");
      }

      activeFilter = isActive === true || isActive === "true";
    }

    const skip = (page - 1) * limit;

    const result = await repository.findRoles({
      skip,
      take: limit,
      search: search?.trim() || undefined,
      application,
      isActive: activeFilter,
    });

    return {
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }

  // --------------------------------------------------
  // GET ROLE BY ID
  // --------------------------------------------------

  async function getRoleById(id) {
    return getRoleOrThrow(id);
  }

  // --------------------------------------------------
  // UPDATE ROLE / ACTIVATE / DEACTIVATE
  // --------------------------------------------------

  async function updateRole(id, data) {
    const role = await getRoleOrThrow(id);

    // 1. Protect system roles
    if (role.isSystem) {
      throw new AppError("System roles cannot be modified", 403, "SYSTEM_ROLE_PROTECTED");
    }

    const allowed = ["name", "description", "isActive", "permissionIds"];

    if (
      !data ||
      Object.keys(data).length === 0 ||
      Object.keys(data).some((key) => !allowed.includes(key))
    ) {
      throw new AppError("Invalid update fields", 400, "INVALID_ROLE_UPDATE");
    }

    const changes = {};

    // 2. Update name
    if (data.name !== undefined) {
      if (typeof data.name !== "string" || !data.name.trim()) {
        throw new AppError("Invalid role name", 400, "INVALID_ROLE_NAME");
      }

      const name = data.name.trim();

      await ensureUniqueRoleName(name, role.application, id);

      changes.name = name;
    }

    // 3. Update description
    if (data.description !== undefined) {
      if (data.description !== null && typeof data.description !== "string") {
        throw new AppError("Invalid description", 400, "INVALID_DESCRIPTION");
      }

      changes.description = data.description;
    }

    // 4. Activate / deactivate
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        throw new AppError("isActive must be boolean", 400, "INVALID_STATUS");
      }

      changes.isActive = data.isActive;
    }

    // 5. Update permissions
    if (data.permissionIds !== undefined) {
      const ids = validatePermissionIds(data.permissionIds);

      await ensureValidPermissions(ids, role.application);

      changes.permissionIds = ids;
    }

    // 6. Updated timestamp using Moment UTC
    changes.updatedAt = moment.utc().toDate();

    // 7. Persist changes
    try {
      return await repository.updateRoleById(id, changes);
    } catch (error) {
      handleRepositoryError(error, "update");
    }
  }

  // --------------------------------------------------
  // DELETE ROLE
  // --------------------------------------------------

  async function deleteRole(id) {
    const role = await getRoleOrThrow(id);

    // 1. System roles cannot be deleted
    if (role.isSystem) {
      throw new AppError("System roles cannot be deleted", 403, "SYSTEM_ROLE_PROTECTED");
    }

    // 2. Check references
    const references = await repository.countRoleReferences(id);

    const isReferenced =
      references.userRoles > 0 || references.duties > 0 || references.sessions > 0;

    if (isReferenced) {
      throw new AppError(
        "Role is assigned or referenced. Deactivate it instead.",
        409,
        "ROLE_IN_USE"
      );
    }

    // 3. Delete role and its permission mappings
    try {
      await repository.removeRoleById(id);

      return { success: true };
    } catch (error) {
      handleRepositoryError(error, "delete");
    }
  }

  return {
    createRole,
    listRoles,
    getRoleById,
    updateRole,
    deleteRole,
  };
}

// --------------------------------------------------
// DEFAULT SERVICE INSTANCE
// --------------------------------------------------

// Inject the actual Prisma repository here.
// Unit tests can inject a mock instead.
const rolesService = createRolesService(rolesRepository);

// Preserve existing named exports used by controllers.
export const createRole = rolesService.createRole;
export const listRoles = rolesService.listRoles;
export const getRoleById = rolesService.getRoleById;
export const updateRole = rolesService.updateRole;
export const deleteRole = rolesService.deleteRole;
