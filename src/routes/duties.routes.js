import { Router } from "express";
import * as controller from "../modules/auth/controllers/duties.controller.js";
import { listAllDutiesSchema, listMyDutiesSchema } from "../modules/auth/validations/duties.validation.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { permissions } from "../common/permissons.js";
import { requirePermission } from "../middlewares/authorize.js";

const dutiesRouter = Router();
dutiesRouter.use(authenticate);
// Logged-in staff: always scoped to the verified identity (no admin requirement).
dutiesRouter.get("/me", validate(listMyDutiesSchema), controller.listMyDuties);

dutiesRouter.get("/", requirePermission(permissions.duties.read), validate(listAllDutiesSchema), controller.listAllDuties);
export default dutiesRouter;
