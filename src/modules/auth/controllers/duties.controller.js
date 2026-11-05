import * as service from "../services/duties.service.js";
import { requestAuditContext } from "../../../utils/requestAuditContext.js";

function actorId(req) {
  return req.user?.id ?? req.auth?.userId ?? req.auth?.user?.id;
}

export async function listAllDuties(req, res) {
  const { data, meta } = await service.listAllDuties(req.validated.query);
  return res.success(data, "Duties retrieved successfully", 200, meta);
}

export async function listMyDuties(req, res) {
  const { data, meta } = await service.listMyDuties(actorId(req), req.validated.query);
  return res.success(data, "Your duties retrieved successfully", 200, meta);
}

