export function responseFormatter(req, res, next) {
  res.success = (data = null, message = "Success", statusCode = 200, meta = undefined) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(meta !== undefined && { meta }),
      requestId: req.id,
    });
  };

  next();
}
