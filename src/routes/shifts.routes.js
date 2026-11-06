import { Router } from "express";

import * as controller from "../modules/auth/controllers/shifts.controller.js";

import {
  createShiftSchema,
  listShiftsSchema,
  getShiftSchema,
  updateShiftSchema,
  deleteShiftSchema,
} from "../modules/auth/validations/shifts.validation.js";

import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { permissions } from "../common/permissons.js";
import { requirePermission } from "../middlewares/authorize.js";

const shiftsRouter = Router();

// Authentication required for all endpoints
shiftsRouter.use(authenticate);



// --------------------------------------------------
// SHIFT MANAGEMENT ROUTES
// --------------------------------------------------

shiftsRouter.post("/", requirePermission(permissions.shifts.create), validate(createShiftSchema), controller.createShift);

shiftsRouter.get("/", requirePermission(permissions.shifts.read), validate(listShiftsSchema), controller.listShifts);

shiftsRouter.get("/:id", requirePermission(permissions.shifts.read),   validate(getShiftSchema), controller.getShiftById);

shiftsRouter.patch("/:id", requirePermission(permissions.shifts.update), validate(updateShiftSchema), controller.updateShift);

shiftsRouter.delete("/:id", requirePermission(permissions.shifts.delete), validate(deleteShiftSchema), controller.deleteShift);

export default shiftsRouter;
