import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export function errorHandler(err, req, res, next) {
  console.log("Error caught in errorHandler middleware:", err);
  if (res.headersSent) return next(err);

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Internal server error";
  let details;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    code = "VALIDATION_ERROR";
    message = "Request validation failed";
    details = err.issues.map((issue) => ({
      field: issue.path.join(".") || "request",
      message: issue.message,
    }));
  } else if (err?.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body exceeds allowed size";
  } else if (err?.type === "entity.parse.failed") {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Malformed JSON request body";
  } else if (err?.code === "P2002") {
    statusCode = 409;
    code = "RESOURCE_CONFLICT";
    message = "Resource already exists";
  } else if (err?.code === "P2025") {
    statusCode = 404;
    code = "RECORD_NOT_FOUND";
    message = "Requested record not found";
  }

  // Don't log raw errors: they may contain SQL or credentials.
  const summary = {
    code, statusCode, errorType: err?.name || "Error",
    route: req.matchedRoute || "UNMATCHED",
  };
  if (statusCode >= 500) req.log?.error(summary, "API error");
  else req.log?.warn(summary, "Request rejected");

  return res.status(statusCode).json({
    success: false,
    message,
    error: { code, ...(details && { details }) },
    requestId: req.id,
  });
}
