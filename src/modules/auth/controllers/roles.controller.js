import * as service from "../services/roles.service.js";

// --------------------------------------------------
// CREATE ROLE
// --------------------------------------------------

export async function createRole(req, res, next) {
  try {
    const role = await service.createRole(req.validated.body);

    return res.status(201).json({
      message: "Role created successfully",
      data: role,
    });
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// LIST ROLES
// --------------------------------------------------

export async function listRoles(req, res, next) {
  try {
    const result = await service.listRoles(req.validated.query);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// GET ROLE BY ID
// --------------------------------------------------

export async function getRoleById(req, res, next) {
  try {
    const role = await service.getRoleById(req.validated.params.id);

    return res.status(200).json({
      data: role,
    });
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// UPDATE ROLE
// --------------------------------------------------

export async function updateRole(req, res, next) {
  try {
    const role = await service.updateRole(req.validated.params.id, req.validated.body);

    return res.status(200).json({
      message: "Role updated successfully",
      data: role,
    });
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// DELETE ROLE
// --------------------------------------------------

export async function deleteRole(req, res, next) {
  try {
    await service.deleteRole(req.validated.params.id);

    return res.status(200).json({
      message: "Role deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}
