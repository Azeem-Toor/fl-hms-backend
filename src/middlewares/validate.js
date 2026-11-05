// Controllers consume req.validated, never raw req.body.
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body === undefined ? {} : req.body,
    params: req.params,
    query: req.query,
  });
  if (!result.success) return next(result.error);
  req.validated = result.data;
  return next();
};
