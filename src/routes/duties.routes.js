import { Router } from "express";
import * as controller from "../modules/auth/controllers/duties.controller.js";
import { listAllDutiesSchema, listMyDutiesSchema } from "../modules/auth/validations/duties.validation.js";
import { authenticate } from "../middlewares/authenticate.js";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import { validate } from "../middlewares/validate.js";

const dutiesRouter = Router();
dutiesRouter.use(authenticate);
// Logged-in staff: always scoped to the verified identity (no admin requirement).
dutiesRouter.get("/me", validate(listMyDutiesSchema), controller.listMyDuties);
// Cross-staff search is Super Admin only.
dutiesRouter.use(requireSuperAdmin);
dutiesRouter.get("/", validate(listAllDutiesSchema), controller.listAllDuties);
export default dutiesRouter;
