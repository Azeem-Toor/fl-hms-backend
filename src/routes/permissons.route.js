import { Router } from "express";

import { authenticate } from "../middlewares/authenticate.js";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import { validate } from "../middlewares/validate.js";
import { listPermissionsSchema } from "../modules/auth/validations/permissons.validation.js";
import * as permissionsController from "../modules/auth/controllers/permissons.controller.js"
import { permissions } from "../common/permissons.js";
import { requirePermission } from "../middlewares/authorize.js";
const permissionsRouter = Router();


// Authentication required for all role endpoints
permissionsRouter.use(authenticate);
// Require SUPER_ADMIN role for all role endpoints
permissionsRouter.use(requireSuperAdmin);


permissionsRouter.get("/",requirePermission(permissions.permissions.read), validate(listPermissionsSchema), permissionsController.listPermissions);

export default permissionsRouter;