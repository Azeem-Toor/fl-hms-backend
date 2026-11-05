import { Router } from "express";
import * as controller from "../modules/auth/controllers/roles.controller.js";
import {
  createRoleSchema,
  listRolesSchema,
  getRoleSchema,
  updateRoleSchema,
  deleteRoleSchema,
} from "../modules/auth/validations/roles.validation.js";
// Adjust this import to the location of your
// existing authenticate middleware.
import { authenticate } from "../middlewares/authenticate.js";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import { validate } from "../middlewares/validate.js";

const rolesRouter = Router();

// Authentication required for all role endpoints
rolesRouter.use(authenticate);
// Require SUPER_ADMIN role for all role endpoints
rolesRouter.use(requireSuperAdmin);



// --------------------------------------------------
// ROLE MANAGEMENT ROUTES
// --------------------------------------------------

rolesRouter.post("/", validate(createRoleSchema), controller.createRole);

rolesRouter.get("/", validate(listRolesSchema), controller.listRoles);

rolesRouter.get("/:id", validate(getRoleSchema), controller.getRoleById);

rolesRouter.patch("/:id", validate(updateRoleSchema), controller.updateRole);

rolesRouter.delete("/:id", validate(deleteRoleSchema), controller.deleteRole);

export default rolesRouter;
