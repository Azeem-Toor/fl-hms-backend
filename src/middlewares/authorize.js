import { AppError } from "../utils/AppError.js";

// Resolve permissions from current DB role assignments, not from JWT claims.
export const authorize = (...requiredPermissions) => (req, res, next) => {
  const granted = new Set(req.auth?.context?.permissions || []);
  if (!requiredPermissions.every((permission) => granted.has(permission))) {
    throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
  }
  next();
};
