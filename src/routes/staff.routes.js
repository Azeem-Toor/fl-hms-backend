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
import { validate } from "../middlewares/validate.js";
import { permissions } from "../common/permissons.js";
import { requirePermission } from "../middlewares/authorize.js";

const staffRouter = Router();

// Authentication required for all endpoints
staffRouter.use(authenticate);



// --------------------------------------------------
// STAFF MANAGEMENT ROUTES
// --------------------------------------------------

staffRouter.post("/", requirePermission(permissions.staff.create), validate(createStaffSchema), controller.createStaff);

staffRouter.get("/", requirePermission(permissions.staff.read), validate(listStaffSchema), controller.listStaff);

staffRouter.get("/:id", requirePermission(permissions.staff.read), validate(getStaffSchema), controller.getStaffById);

staffRouter.patch("/:id", requirePermission(permissions.staff.update), validate(updateStaffSchema), controller.updateStaff);

staffRouter.patch(
  "/:id/password",
  requirePermission(permissions.staff.update),
  validate(resetStaffPasswordSchema),
  controller.resetStaffPassword
);

staffRouter.delete("/:id", requirePermission(permissions.staff.delete), validate(deleteStaffSchema), controller.deleteStaff);

export default staffRouter;
