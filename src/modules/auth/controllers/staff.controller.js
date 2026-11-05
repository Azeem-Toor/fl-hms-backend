import * as service from "../services/staff.service.js";

function getActorId(req) {
  return req.user?.id ?? req.auth?.user?.id;
}

// --------------------------------------------------
// CREATE STAFF
// --------------------------------------------------

export async function createStaff(req, res, next) {
  try {
    const result = await service.createStaff(req.validated.body, getActorId(req));

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// LIST STAFF
// --------------------------------------------------

export async function listStaff(req, res, next) {
  try {
    const result = await service.listStaff(req.validated.query);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// GET STAFF BY ID
// --------------------------------------------------

export async function getStaffById(req, res, next) {
  try {
    const result = await service.getStaffById(req.validated.params.id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// UPDATE STAFF
// --------------------------------------------------

export async function updateStaff(req, res, next) {
  try {
    const result = await service.updateStaff(
      req.validated.params.id,
      req.validated.body,
      getActorId(req)
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// RESET STAFF PASSWORD
// --------------------------------------------------

export async function resetStaffPassword(req, res, next) {
  try {
    const result = await service.resetStaffPassword(
      req.validated.params.id,
      req.validated.body.password,
      getActorId(req)
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// DELETE STAFF
// --------------------------------------------------

export async function deleteStaff(req, res, next) {
  try {
    const result = await service.deleteStaff(req.validated.params.id, getActorId(req));

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
