import { Router } from "express";
import * as controller from "../modules/auth/controllers/dutyRosters.controller.js";
import {
  createDutyRosterSchema,
  listDutyRostersSchema,
  getDutyRosterSchema,
  replaceDutyRosterSchema,
  updateDutyRosterSchema,
  cancelDutyRosterSchema,
  deleteDutyRosterSchema,
  listRosterDutiesSchema, getRosterDutySchema, addRosterDutiesSchema,
  updateRosterDutySchema, deleteRosterDutySchema, cancelRosterDutySchema,
  replaceRosterDutySchema, listRosterActivitySchema, validateDutyRosterSchema,
} from "../modules/auth/validations/dutyRosters.validation.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { permissions } from "../common/permissons.js";
import { requirePermission } from "../middlewares/authorize.js";

const dutyRostersRouter = Router();
dutyRostersRouter.use(authenticate);

dutyRostersRouter.post("/validate",requirePermission(permissions.dutyRosters.create), validate(validateDutyRosterSchema), controller.validateDutyRoster);
dutyRostersRouter.post("/", requirePermission(permissions.dutyRosters.create), validate(createDutyRosterSchema), controller.createDutyRoster);
dutyRostersRouter.get("/", requirePermission(permissions.dutyRosters.read), validate(listDutyRostersSchema), controller.listDutyRosters);
dutyRostersRouter.get("/:id", requirePermission(permissions.dutyRosters.read), validate(getDutyRosterSchema), controller.getDutyRosterById);
dutyRostersRouter.put("/:id", requirePermission(permissions.dutyRosters.update), validate(replaceDutyRosterSchema), controller.replaceDutyRoster);
dutyRostersRouter.patch("/:id", requirePermission(permissions.dutyRosters.update), validate(updateDutyRosterSchema), controller.updateDutyRoster);
dutyRostersRouter.post("/:id/cancel", requirePermission(permissions.dutyRosters.update), validate(cancelDutyRosterSchema), controller.cancelDutyRoster);
dutyRostersRouter.delete("/:id", requirePermission(permissions.dutyRosters.delete), validate(deleteDutyRosterSchema), controller.deleteDutyRoster);


dutyRostersRouter.get("/:id/duties", requirePermission(permissions.dutyRosters.read), validate(listRosterDutiesSchema), controller.listRosterDuties);
dutyRostersRouter.get("/:id/duties/:dutyId", requirePermission(permissions.dutyRosters.read), validate(getRosterDutySchema), controller.getRosterDuty);
dutyRostersRouter.post("/:id/duties", requirePermission(permissions.dutyRosters.create), validate(addRosterDutiesSchema), controller.addRosterDuties);
dutyRostersRouter.patch("/:id/duties/:dutyId", requirePermission(permissions.dutyRosters.update), validate(updateRosterDutySchema), controller.updateRosterDuty);
dutyRostersRouter.delete("/:id/duties/:dutyId", requirePermission(permissions.dutyRosters.delete), validate(deleteRosterDutySchema), controller.deleteRosterDuty);
dutyRostersRouter.post("/:id/duties/:dutyId/cancel", requirePermission(permissions.dutyRosters.update), validate(cancelRosterDutySchema), controller.cancelRosterDuty);
dutyRostersRouter.post("/:id/duties/:dutyId/replace", requirePermission(permissions.dutyRosters.update), validate(replaceRosterDutySchema), controller.replaceRosterDuty);
dutyRostersRouter.get("/:id/activity", requirePermission(permissions.dutyRosters.read), validate(listRosterActivitySchema), controller.listRosterActivity);


export default dutyRostersRouter;
