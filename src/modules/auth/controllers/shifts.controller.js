import * as service from "../services/shifts.service.js";

// --------------------------------------------------
// ACTOR ID
// --------------------------------------------------

function getActorId(req) {
  return req.user?.id ?? req.auth?.userId ?? req.auth?.user?.id;
}

// --------------------------------------------------
// CREATE SHIFT
// --------------------------------------------------

export async function createShift(req, res) {
  const data = await service.createShift(req.validated.body, getActorId(req));

  return res.success(data, "Shift created successfully", 201);
}

// --------------------------------------------------
// LIST SHIFTS
// --------------------------------------------------

export async function listShifts(req, res) {
  const { data, meta } = await service.listShifts(req.validated.query);

  return res.success(data, "Shifts retrieved successfully", 200, meta);
}

// --------------------------------------------------
// GET SHIFT BY ID
// --------------------------------------------------

export async function getShiftById(req, res) {
  const data = await service.getShiftById(req.validated.params.id);

  return res.success(data, "Shift retrieved successfully");
}

// --------------------------------------------------
// UPDATE SHIFT
// --------------------------------------------------

export async function updateShift(req, res) {
  const data = await service.updateShift(
    req.validated.params.id,
    req.validated.body,
    getActorId(req)
  );

  return res.success(data, "Shift updated successfully");
}

// --------------------------------------------------
// DELETE SHIFT
// --------------------------------------------------

export async function deleteShift(req, res) {
  await service.deleteShift(req.validated.params.id, getActorId(req));

  return res.success(null, "Shift deleted successfully");
}
