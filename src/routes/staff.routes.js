import { Router } from "express";

import * as controller from "../modules/auth/controllers/staff.controller.js";

import {
  createStaffSchema,
  listStaffSchema,
  getStaffSchema,
  updateStaffSchema,
  resetStaffPasswordSchema,
  deleteStaffSchema,
} from "../modules/auth/validations/staff.validation.js";

import { authenticate } from "../middlewares/authenticate.js";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import { validate } from "../middlewares/validate.js";

const staffRouter = Router();

// Authentication required for all endpoints
staffRouter.use(authenticate);

// Super Admin authorization required
staffRouter.use(requireSuperAdmin);

// --------------------------------------------------
// STAFF MANAGEMENT ROUTES
// --------------------------------------------------

staffRouter.post("/", validate(createStaffSchema), controller.createStaff);

staffRouter.get("/", validate(listStaffSchema), controller.listStaff);

staffRouter.get("/:id", validate(getStaffSchema), controller.getStaffById);

staffRouter.patch("/:id", validate(updateStaffSchema), controller.updateStaff);

staffRouter.patch(
  "/:id/password",
  validate(resetStaffPasswordSchema),
  controller.resetStaffPassword
);

staffRouter.delete("/:id", validate(deleteStaffSchema), controller.deleteStaff);

export default staffRouter;
