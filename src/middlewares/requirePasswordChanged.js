import { AppError } from "../utils/AppError.js";

// Apply to ALL non-exempt protected routes (Auth/Doctor/Pharmacy/Staff later).
export function requirePasswordChanged(req, res, next) {
  if (req.auth?.mustChangePassword) {
    throw new AppError("Change your temporary password first", 403, "PASSWORD_CHANGE_REQUIRED");
  }
  next();
}
