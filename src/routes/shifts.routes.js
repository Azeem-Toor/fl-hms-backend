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
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import { validate } from "../middlewares/validate.js";

const shiftsRouter = Router();

// Authentication required for all endpoints
shiftsRouter.use(authenticate);

// Super Admin authorization required
shiftsRouter.use(requireSuperAdmin);

// --------------------------------------------------
// SHIFT MANAGEMENT ROUTES
// --------------------------------------------------

shiftsRouter.post("/", validate(createShiftSchema), controller.createShift);

shiftsRouter.get("/", validate(listShiftsSchema), controller.listShifts);

shiftsRouter.get("/:id", validate(getShiftSchema), controller.getShiftById);

shiftsRouter.patch("/:id", validate(updateShiftSchema), controller.updateShift);

shiftsRouter.delete("/:id", validate(deleteShiftSchema), controller.deleteShift);

export default shiftsRouter;
