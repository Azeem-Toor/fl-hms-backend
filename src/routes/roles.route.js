import { Router } from "express";
import * as controller from "../modules/auth/controllers/roles.controller.js";
import {
  createRoleSchema,
  listRolesSchema,
  getRoleSchema,
  updateRoleSchema,
  deleteRoleSchema,
} from "../modules/auth/validations/roles.validation.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { permissions } from "../common/permissons.js";
import { requirePermission } from "../middlewares/authorize.js";
const rolesRouter = Router();

// Authentication required for all role endpoints
rolesRouter.use(authenticate);




// --------------------------------------------------
// ROLE MANAGEMENT ROUTES
// --------------------------------------------------

rolesRouter.post("/", requirePermission(permissions.roles.create), validate(createRoleSchema), controller.createRole);

rolesRouter.get("/", requirePermission(permissions.roles.read), validate(listRolesSchema), controller.listRoles);

rolesRouter.get("/:id", requirePermission(permissions.roles.read), validate(getRoleSchema), controller.getRoleById);

rolesRouter.patch("/:id", requirePermission(permissions.roles.update), validate(updateRoleSchema), controller.updateRole);

rolesRouter.delete("/:id", requirePermission(permissions.roles.delete), validate(deleteRoleSchema), controller.deleteRole);

export default rolesRouter;
