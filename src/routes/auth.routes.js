import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { captureRoute } from "../middlewares/captureRoute.js";
import { validate } from "../middlewares/validate.js";
import { authenticate } from "../middlewares/authenticate.js";
import { requirePasswordChanged } from "../middlewares/requirePasswordChanged.js";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import * as controller from "../modules/auth/controllers/auth.controller.js";
import * as schema from "../modules/auth/validations/auth.validation.js";

const router = Router();

const limited = (limit) =>
  rateLimit({
    windowMs: env.auth.rateLimitWindowMinutes * 60_000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler(req, res, next) {
      next(new AppError("Too many requests; try again later", 429, "RATE_LIMITED"));
    },
  });

router.post(
  "/login",
  captureRoute,
  limited(env.auth.loginRateLimit),
  validate(schema.loginSchema),
  controller.login
);
router.post(
  "/refresh",
  captureRoute,
  limited(env.auth.refreshRateLimit),
  validate(schema.refreshSchema),
  controller.refreshTokenController
);
router.post("/logout", captureRoute, authenticate, controller.logout);
router.patch(
  "/password",
  captureRoute,
  authenticate,
  validate(schema.changePasswordSchema),
  controller.changePassword
);
router.patch(
  "/users/:userId/password",
  captureRoute,
  authenticate,
  requirePasswordChanged,
  requireSuperAdmin,
  validate(schema.adminResetPasswordSchema),
  controller.resetPassword
);
router.get("/users/me", captureRoute, authenticate, controller.getMe);

export default router;
