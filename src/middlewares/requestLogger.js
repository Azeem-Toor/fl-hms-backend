import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import { logger } from "../config/logger.js";

export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const id = randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  serializers: {
    req(req) { return { id: req.id, method: req.method }; },
    res(res) { return { statusCode: res.statusCode }; },
  },
  customSuccessObject(req, res, loggable) {
    return { ...loggable, route: req.matchedRoute || "UNMATCHED" };
  },
  customErrorObject(req, res, err, loggable) {
    const { err: _ignoredError, ...safe } = loggable;
    return { ...safe, route: req.matchedRoute || "UNMATCHED" };
  },
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
