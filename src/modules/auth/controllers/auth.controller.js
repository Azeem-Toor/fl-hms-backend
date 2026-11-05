import * as service from "../services/auth.service.js";
import { requestAuditContext } from "../../../utils/requestAuditContext.js";

// Express 5 automatically passes rejected async handlers to errorHandler.
export async function login(req, res) {
  const data = await service.login(req.validated.body, requestAuditContext(req));
  return res.success(data, "Login successful");
}

export async function refreshTokenController(req, res) {
  const data = await service.refreshTokenService(req.validated.body, requestAuditContext(req));
  return res.success(data, "Tokens refreshed");
}

export async function logout(req, res) {
  await service.logout(req.auth, requestAuditContext(req));
  return res.success(null, "Logged out successfully");
}

export async function changePassword(req, res) {
  await service.changeOwnPassword(req.auth, req.validated.body, requestAuditContext(req));
  return res.success(null, "Password changed successfully");
}

export async function resetPassword(req, res) {
  await service.resetStaffPassword(
    req.auth,
    req.validated.params.userId,
    req.validated.body.newPassword,
    requestAuditContext(req)
  );
  return res.success(null, "Temporary password set; user must change it on next login");
}

export async function getMe(req, res) {
  return res.success(service.currentUser(req.auth), "Current user context");
}
