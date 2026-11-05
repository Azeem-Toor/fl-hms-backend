// Register first on a route so validation failures still log the endpoint template.
export function captureRoute(req, res, next) {
  req.matchedRoute = typeof req.route?.path === "string"
    ? `${req.baseUrl || ""}${req.route.path}` : "UNMATCHED";
  next();
}
