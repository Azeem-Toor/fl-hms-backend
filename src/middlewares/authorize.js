import { AppError } from "../utils/AppError.js";
import { permissionSeed } from "../common/permissions.js";

// Known permission codes for configuration validation.
const validPermissions = new Set(permissionSeed.map(({ code }) => code));

/**
 * Check whether the authenticated user has a required permission.
 *
 * Must run after authenticate middleware.
 *
 * @param {string} requiredPermission
 * @returns {import("express").RequestHandler}
 */
export function requirePermission(requiredPermission) {
  // Validate permission configuration during route registration.
  if (!validPermissions.has(requiredPermission)) {
    throw new Error(`Unknown permission configured: ${String(requiredPermission)}`);
  }

  return (req, res, next) => {
    const permissions = req.auth?.context?.permissions;

    // Authentication middleware must execute first.
    if (!req.auth) {
      return next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
    }

    // Check only the permission code.
    if (!Array.isArray(permissions) || !permissions.includes(requiredPermission)) {
      return next(new AppError("Insufficient permissions", 403, "FORBIDDEN"));
    }

    return next();
  };
}
