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
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin.js";
import { validate } from "../middlewares/validate.js";

const dutyRostersRouter = Router();
dutyRostersRouter.use(authenticate);
dutyRostersRouter.use(requireSuperAdmin);

dutyRostersRouter.post("/validate", validate(validateDutyRosterSchema), controller.validateDutyRoster);
dutyRostersRouter.post("/", validate(createDutyRosterSchema), controller.createDutyRoster);
dutyRostersRouter.get("/", validate(listDutyRostersSchema), controller.listDutyRosters);
dutyRostersRouter.get("/:id", validate(getDutyRosterSchema), controller.getDutyRosterById);
dutyRostersRouter.put("/:id", validate(replaceDutyRosterSchema), controller.replaceDutyRoster);
dutyRostersRouter.patch("/:id", validate(updateDutyRosterSchema), controller.updateDutyRoster);
dutyRostersRouter.post("/:id/cancel", validate(cancelDutyRosterSchema), controller.cancelDutyRoster);
dutyRostersRouter.delete("/:id", validate(deleteDutyRosterSchema), controller.deleteDutyRoster);

// Phase 2: individual duty operations, while preserving Phase 1 paths.
dutyRostersRouter.get("/:id/duties", validate(listRosterDutiesSchema), controller.listRosterDuties);
dutyRostersRouter.get("/:id/duties/:dutyId", validate(getRosterDutySchema), controller.getRosterDuty);
dutyRostersRouter.post("/:id/duties", validate(addRosterDutiesSchema), controller.addRosterDuties);
dutyRostersRouter.patch("/:id/duties/:dutyId", validate(updateRosterDutySchema), controller.updateRosterDuty);
dutyRostersRouter.delete("/:id/duties/:dutyId", validate(deleteRosterDutySchema), controller.deleteRosterDuty);
dutyRostersRouter.post("/:id/duties/:dutyId/cancel", validate(cancelRosterDutySchema), controller.cancelRosterDuty);
dutyRostersRouter.post("/:id/duties/:dutyId/replace", validate(replaceRosterDutySchema), controller.replaceRosterDuty);
dutyRostersRouter.get("/:id/activity", validate(listRosterActivitySchema), controller.listRosterActivity);


export default dutyRostersRouter;
