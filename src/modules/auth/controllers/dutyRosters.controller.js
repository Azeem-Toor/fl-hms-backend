import * as service from "../services/dutyRosters.service.js";
import { requestAuditContext } from "../../../utils/requestAuditContext.js";

function actorId(req) {
  return req.user?.id ?? req.auth?.userId ?? req.auth?.user?.id;
}

export async function createDutyRoster(req, res) {
  const data = await service.createDutyRoster(req.validated.body, actorId(req), requestAuditContext(req));
  return res.success(data, "Duty roster created successfully", 201);
}

export async function listDutyRosters(req, res) {
  const { data, meta } = await service.listDutyRosters(req.validated.query);
  return res.success(data, "Duty rosters retrieved successfully", 200, meta);
}

export async function getDutyRosterById(req, res) {
  const data = await service.getDutyRosterById(req.validated.params.id);
  return res.success(data, "Duty roster retrieved successfully");
}

export async function replaceDutyRoster(req, res) {
  const data = await service.replaceDutyRoster(
    req.validated.params.id, req.validated.body, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Duty roster saved successfully");
}

export async function updateDutyRoster(req, res) {
  const data = await service.updateDutyRoster(
    req.validated.params.id, req.validated.body, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Duty roster updated successfully");
}

export async function cancelDutyRoster(req, res) {
  const data = await service.cancelDutyRoster(
    req.validated.params.id, req.validated.body, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Duty roster cancelled successfully");
}

export async function deleteDutyRoster(req, res) {
  await service.deleteDutyRoster(
    req.validated.params.id, req.validated.query, actorId(req), requestAuditContext(req)
  );
  return res.success(null, "Draft duty roster deleted successfully");
}

// Phase 2: roster-scoped duty operations
export async function listRosterDuties(req, res) {
  const { data, meta } = await service.listRosterDuties(req.validated.params.id, req.validated.query);
  return res.success(data, "Roster duties retrieved successfully", 200, meta);
}

export async function getRosterDuty(req, res) {
  const { id, dutyId } = req.validated.params;
  const data = await service.getRosterDuty(id, dutyId);
  return res.success(data, "Duty retrieved successfully");
}

export async function addRosterDuties(req, res) {
  const data = await service.addRosterDuties(
    req.validated.params.id, req.validated.body, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Duty assignments added successfully", 201);
}

export async function updateRosterDuty(req, res) {
  const { id, dutyId } = req.validated.params;
  const data = await service.updateRosterDuty(
    id, dutyId, req.validated.body, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Draft duty updated successfully");
}

export async function deleteRosterDuty(req, res) {
  const { id, dutyId } = req.validated.params;
  const data = await service.deleteRosterDuty(
    id, dutyId, req.validated.query, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Draft duty deleted successfully");
}

export async function cancelRosterDuty(req, res) {
  const { id, dutyId } = req.validated.params;
  const data = await service.cancelRosterDuty(
    id, dutyId, req.validated.body, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Published duty cancelled successfully");
}

export async function replaceRosterDuty(req, res) {
  const { id, dutyId } = req.validated.params;
  const data = await service.replaceRosterDuty(
    id, dutyId, req.validated.body, actorId(req), requestAuditContext(req)
  );
  return res.success(data, "Published duty replaced successfully", 201);
}


export async function listRosterActivity(req, res) {
  const { data, meta } = await service.listRosterActivity(req.validated.params.id, req.validated.query);
  return res.success(data, "Roster activity retrieved successfully", 200, meta);
}

export async function validateDutyRoster(req, res) {
  const data = await service.validateDutyRoster(req.validated.body, actorId(req));
  return res.success(data, "Roster validation completed");
}
