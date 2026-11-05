import * as service from "../services/permissons.service.js";

export async function listPermissions(req, res, next) {
  try {
    const result = await service.listPermissions(req.validated.query);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
