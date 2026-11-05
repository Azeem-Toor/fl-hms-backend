import { AppError } from "../utils/AppError.js";

// SUPER_ADMIN only in ADMIN app; no cross-application privilege leakage.
export function requireSuperAdmin(req, res, next) {
  const context = req.auth?.context;
  if (context?.application !== "ADMIN" ||
      !context.roles.some((role) => role.code === "SUPER_ADMIN")) {
    throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
  }
  next();
}
