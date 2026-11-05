import moment from "moment";
import { AppError } from "../../../utils/AppError.js";
import * as repository from "../repositories/shifts.repository.js";

const MINUTES_PER_DAY = 1440;

// --------------------------------------------------
// BUSINESS HELPERS
// --------------------------------------------------

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function requireActor(actorId) {
  if (typeof actorId !== "string" || !actorId.trim()) {
    throw new AppError("Authenticated actor is required", 401, "UNAUTHORIZED");
  }
}

function validateShiftTimes(startMinute, endMinute) {
  const validMinute = (value) =>
    Number.isSafeInteger(value) && value >= 0 && value < MINUTES_PER_DAY;

  if (!validMinute(startMinute) || !validMinute(endMinute)) {
    throw new AppError(
      "Shift times must be integers between 0 and 1439",
      400,
      "INVALID_SHIFT_TIME"
    );
  }

  if (startMinute === endMinute) {
    throw new AppError("Shift start and end times cannot be equal", 400, "INVALID_SHIFT_TIME");
  }
}

// --------------------------------------------------
// SHIFT OVERLAP HELPERS
// --------------------------------------------------

// Split overnight shifts into intervals.
//
// 08:00 - 16:00 => [[480, 960]]
// 22:00 - 06:00 => [[1320, 1440], [0, 360]]
// 16:00 - 00:00 => [[960, 1440]]

function shiftIntervals(startMinute, endMinute) {
  if (startMinute < endMinute) {
    return [[startMinute, endMinute]];
  }

  const intervals = [[startMinute, MINUTES_PER_DAY]];

  if (endMinute > 0) {
    intervals.push([0, endMinute]);
  }

  return intervals;
}

function shiftsOverlap(first, second) {
  const firstIntervals = shiftIntervals(first.startMinute, first.endMinute);

  const secondIntervals = shiftIntervals(second.startMinute, second.endMinute);

  return firstIntervals.some(([startA, endA]) =>
    secondIntervals.some(([startB, endB]) => startA < endB && startB < endA)
  );
}

// --------------------------------------------------
// GET SHIFT OR THROW
// --------------------------------------------------

async function getShiftOrThrow(id, db = null) {
  const shift = db ? await db.findById(id) : await repository.findShiftById(id);

  if (!shift) {
    throw new AppError("Shift not found", 404, "SHIFT_NOT_FOUND");
  }

  return shift;
}

// --------------------------------------------------
// VALIDATE UNIQUE NAME
// --------------------------------------------------

async function ensureUniqueName(db, name, excludeId = null) {
  const shifts = await db.findNames();
  const normalized = normalizeName(name);

  const exists = shifts.some(
    (shift) => shift.id !== excludeId && normalizeName(shift.name) === normalized
  );

  if (exists) {
    throw new AppError("A shift with this name already exists", 409, "SHIFT_EXISTS");
  }
}

// --------------------------------------------------
// VALIDATE SHIFT OVERLAP
// --------------------------------------------------

async function ensureNoOverlap(db, startMinute, endMinute, excludeId = null) {
  validateShiftTimes(startMinute, endMinute);

  const activeShifts = await db.findActiveIntervals(excludeId);

  const proposed = { startMinute, endMinute };

  const conflictingShift = activeShifts.find((shift) => shiftsOverlap(proposed, shift));

  if (conflictingShift) {
    throw new AppError(
      `Shift timing overlaps with "${conflictingShift.name}"`,
      409,
      "SHIFT_OVERLAP"
    );
  }
}

// --------------------------------------------------
// AUDIT LOG HELPER
// --------------------------------------------------

function buildAudit(action, actorId, entityId, metadata) {
  return {
    action,
    outcome: "SUCCESS",
    actorId,
    application: "ADMIN",
    entityType: "SHIFT",
    entityId,
    metadata,
    createdAt: moment.utc().toDate(),
  };
}

// --------------------------------------------------
// REPOSITORY ERROR HANDLING
// --------------------------------------------------

function handleRepositoryError(error, operation) {
  if (error?.name !== "ShiftRepositoryError") {
    throw error;
  }

  switch (error.code) {
    case "UNIQUE_CONSTRAINT":
      throw new AppError("A shift with this name already exists", 409, "SHIFT_EXISTS");

    case "RECORD_NOT_FOUND":
      throw new AppError("Shift not found", 404, "SHIFT_NOT_FOUND");

    case "FOREIGN_KEY_CONSTRAINT":
      if (operation === "delete") {
        throw new AppError(
          "Shift is referenced by duties. Deactivate it instead.",
          409,
          "SHIFT_IN_USE"
        );
      }
      break;

    case "TRANSACTION_CONFLICT":
    case "TRANSACTION_FAILURE":
    case "DATABASE_TIMEOUT":
      throw new AppError(
        "Shift operation could not be completed. Please retry.",
        503,
        "SHIFT_TRANSACTION_CONFLICT"
      );
  }

  throw error;
}

// --------------------------------------------------
// CREATE SHIFT
// --------------------------------------------------

export async function createShift(data, actorId) {
  requireActor(actorId);

  const { name, description, startMinute, endMinute, isActive = true } = data;

  validateShiftTimes(startMinute, endMinute);

  const normalizedName = name.trim();

  try {
    return await repository.withTransaction(async (db) => {
      // 1. Validate unique name
      await ensureUniqueName(db, normalizedName);

      // 2. Prevent overlap for active shifts
      if (isActive) {
        await ensureNoOverlap(db, startMinute, endMinute);
      }

      // 3. Create shift
      const shift = await db.insert({
        name: normalizedName,
        description: description ?? null,
        startMinute,
        endMinute,
        isActive,
      });

      // 4. Audit creation
      await db.insertAuditLog(
        buildAudit("SHIFT_CREATE", actorId, shift.id, {
          name: shift.name,
          startMinute: shift.startMinute,
          endMinute: shift.endMinute,
          isActive: shift.isActive,
        })
      );

      return shift;
    });
  } catch (error) {
    handleRepositoryError(error, "create");
  }
}

// --------------------------------------------------
// LIST SHIFTS WITH PAGINATION
// --------------------------------------------------

export async function listShifts({ page = 1, limit = 10, search, isActive } = {}) {
  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 100
  ) {
    throw new AppError("Invalid pagination", 400, "INVALID_PAGINATION");
  }

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip) || skip < 0) {
    throw new AppError("Invalid pagination range", 400, "INVALID_PAGINATION");
  }

  let activeFilter;

  if (isActive !== undefined) {
    if (isActive !== "true" && isActive !== "false") {
      throw new AppError("Invalid isActive filter", 400, "INVALID_FILTER");
    }

    activeFilter = isActive === "true";
  }

  const { shifts, total } = await repository.findShifts({
    skip,
    take: limit,
    search: search?.trim() || undefined,
    isActive: activeFilter,
  });

  return {
    data: shifts,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// --------------------------------------------------
// GET SHIFT BY ID
// --------------------------------------------------

export async function getShiftById(id) {
  return getShiftOrThrow(id);
}

// --------------------------------------------------
// UPDATE SHIFT / ACTIVATE / DEACTIVATE
// --------------------------------------------------

export async function updateShift(id, data, actorId) {
  requireActor(actorId);

  if (!data || Object.keys(data).length === 0) {
    throw new AppError("At least one field is required", 400, "INVALID_SHIFT_UPDATE");
  }

  const allowed = ["name", "description", "startMinute", "endMinute", "isActive"];

  if (Object.keys(data).some((key) => !allowed.includes(key))) {
    throw new AppError("Invalid shift update fields", 400, "INVALID_SHIFT_UPDATE");
  }

  try {
    return await repository.withTransaction(async (db) => {
      // 1. Retrieve existing shift
      const shift = await getShiftOrThrow(id, db);

      // 2. Merge existing values with updates
      const startMinute = data.startMinute ?? shift.startMinute;

      const endMinute = data.endMinute ?? shift.endMinute;

      const isActive = data.isActive ?? shift.isActive;

      // 3. Validate resulting timing
      validateShiftTimes(startMinute, endMinute);

      // 4. Validate name uniqueness
      if (data.name !== undefined) {
        await ensureUniqueName(db, data.name, id);
      }

      // 5. Check overlap when timing changes
      // or the shift is activated.
      const requiresOverlapCheck =
        isActive &&
        (data.startMinute !== undefined || data.endMinute !== undefined || data.isActive === true);

      if (requiresOverlapCheck) {
        await ensureNoOverlap(db, startMinute, endMinute, id);
      }

      // 6. Build update payload
      const changes = {};

      if (data.name !== undefined) {
        changes.name = data.name.trim();
      }

      if (data.description !== undefined) {
        changes.description = data.description;
      }

      if (data.startMinute !== undefined) {
        changes.startMinute = startMinute;
      }

      if (data.endMinute !== undefined) {
        changes.endMinute = endMinute;
      }

      if (data.isActive !== undefined) {
        changes.isActive = isActive;
      }

      changes.updatedAt = moment.utc().toDate();

      // 7. Update shift
      const updated = await db.update(id, changes);

      // 8. Audit update
      await db.insertAuditLog(
        buildAudit("SHIFT_UPDATE", actorId, updated.id, {
          changes: data,
          previous: {
            name: shift.name,
            description: shift.description,
            startMinute: shift.startMinute,
            endMinute: shift.endMinute,
            isActive: shift.isActive,
          },
        })
      );

      return updated;
    });
  } catch (error) {
    handleRepositoryError(error, "update");
  }
}

// --------------------------------------------------
// DELETE SHIFT
// --------------------------------------------------

export async function deleteShift(id, actorId) {
  requireActor(actorId);

  try {
    return await repository.withTransaction(async (db) => {
      // 1. Retrieve shift
      const shift = await getShiftOrThrow(id, db);

      // 2. Prevent deleting referenced shifts
      const dutyCount = await db.countDuties(id);

      if (dutyCount > 0) {
        throw new AppError(
          "Shift is referenced by duties. Deactivate it instead.",
          409,
          "SHIFT_IN_USE"
        );
      }

      // 3. Delete shift
      await db.remove(id);

      // 4. Audit deletion
      await db.insertAuditLog(
        buildAudit("SHIFT_DELETE", actorId, id, {
          name: shift.name,
          startMinute: shift.startMinute,
          endMinute: shift.endMinute,
        })
      );

      return { success: true };
    });
  } catch (error) {
    handleRepositoryError(error, "delete");
  }
}
