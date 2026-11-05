export function requestAuditContext(req) {
  return {
    requestId: req.id,
    ipAddress: req.ip?.slice(0, 64) || null,
    userAgent: req.get("user-agent")?.slice(0, 512) || null,
  };
}
