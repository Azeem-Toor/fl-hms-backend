import moment from "moment";
import { requireActor, calendarDate, toDateString, dutyDate, assertDateRange, assertDutyInRange, actualTimes, validateInternalOverlap, validateEligibility, validatePublishedConflicts, auditRecord, getRosterOrThrow, ensureDraft, ensureVersion, nextVersion, guardedUpdate, clinicDayBounds } from "./dutyScheduling.rules.js";
import { AppError } from "../../../utils/AppError.js";
import * as repository from "../repositories/dutyRosters.repository.js";

const MAX_DUTIES = 1000;

function keyOf(userId, roleId, shiftId, date) {
  return `${date}|${userId}|${roleId}|${shiftId}`;
}

function flattenSchedule(schedule, startDate, endDate) {
  const flattened = [];
  const dates = new Set();
  for (const day of schedule) {
    if (dates.has(day.date)) {
      throw new AppError("Schedule date is repeated", 400, "DUPLICATE_SCHEDULE_DATE");
    }
    dates.add(day.date);
    assertDutyInRange(day.date, startDate, endDate);
    for (const duty of day.duties) {
      flattened.push({ ...duty, date: day.date });
      if (flattened.length > MAX_DUTIES) {
        throw new AppError("Maximum 1000 duties per roster", 400, "ROSTER_TOO_LARGE");
      }
    }
  }
  return flattened;
}

// Convert draft input into actual Duty records. Keep existing timestamps/IDs
// for unchanged assignments, even if the Shift template was edited later.
function prepareDuties(input, shiftMap, existing = []) {
  const old = new Map();
  for (const duty of existing) {
    if (duty.status !== "ASSIGNED") continue;
    old.set(keyOf(duty.userId, duty.roleId, duty.shiftId, dutyDate(duty)), duty);
  }
  const usedIds = [];
  const newDuties = [];
  const all = [];
  const identities = new Set();

  for (const duty of input) {
    const key = keyOf(duty.userId, duty.roleId, duty.shiftId, duty.date);
    if (identities.has(key)) {
      throw new AppError("Identical duty appears more than once", 409, "DUPLICATE_DUTY");
    }
    identities.add(key);
    const retained = old.get(key);
    const times = retained
      ? { startsAt: retained.startsAt, endsAt: retained.endsAt }
      : actualTimes(duty.date, shiftMap.get(duty.shiftId));
    const prepared = { userId: duty.userId, roleId: duty.roleId, shiftId: duty.shiftId, ...times };
    all.push(prepared);
    if (retained) usedIds.push(retained.id);
    else newDuties.push(prepared);
  }
  validateInternalOverlap(all);
  return { all, usedIds, newDuties };
}

function handleRepositoryError(error) {
  if (error?.name !== "DutyRosterRepositoryError") throw error;
  if (error.code === "RECORD_NOT_FOUND") {
    throw new AppError("Roster not found", 404, "ROSTER_NOT_FOUND");
  }
  if (error.code === "FOREIGN_KEY_CONSTRAINT") {
    throw new AppError("A referenced staff member, role or shift is invalid", 409, "INVALID_ROSTER_REFERENCE");
  }
  if (error.code === "UNIQUE_CONSTRAINT") {
    throw new AppError("Conflicting or duplicate duty assignment", 409, "DUPLICATE_DUTY");
  }
  if (error.code === "TRANSACTION_CONFLICT") {
    throw new AppError("Roster was modified concurrently. Reload and retry.", 409, "ROSTER_CONCURRENT_UPDATE");
  }
  throw error;
}

function mapRoster(record) {
  const { _count, duties = [], ...roster } = record;
  const schedule = new Map();
  for (const duty of duties) {
    const date = dutyDate(duty);
    if (!schedule.has(date)) schedule.set(date, []);
    schedule.get(date).push({ ...duty, date });
  }
  return {
    ...roster,
    startDate: toDateString(roster.startDate),
    endDate: toDateString(roster.endDate),
    dutyCount: _count?.duties ?? duties.length,
    schedule: [...schedule.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, duties: items })),
  };
}

function mapSummary(record) {
  const { _count, ...roster } = record;
  return {
    ...roster,
    startDate: toDateString(roster.startDate),
    endDate: toDateString(roster.endDate),
    dutyCount: _count.duties,
  };
}

function activeDuties(roster) {
  return roster.duties.filter((d) => d.status === "ASSIGNED");
}

export async function createDutyRoster(data, actorId, audit = {}) {
  requireActor(actorId);
  const { name, startDate, endDate, status, schedule } = data;
  assertDateRange(startDate, endDate);
  const input = flattenSchedule(schedule, startDate, endDate);
  try {
    const saved = await repository.withTransaction(async (db) => {
      const shiftMap = await validateEligibility(db, input);
      const { all, newDuties } = prepareDuties(input, shiftMap);
      if (status === "PUBLISHED") await validatePublishedConflicts(db, all);

      const createdAt = moment.utc().toDate();
      const roster = await db.createRoster({
        name, startDate: calendarDate(startDate), endDate: calendarDate(endDate),
        status, createdById: actorId,
        ...(status === "PUBLISHED" && { publishedAt: createdAt }),
      });
      await db.insertDuties(newDuties.map((d) => ({ ...d, rosterId: roster.id })));
      await db.insertAudit(auditRecord("ROSTER_CREATED", roster.id, actorId, audit, {
        status, dutyCount: all.length,
      }));
      return db.findById(roster.id);
    });
    return mapRoster(saved);
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function listDutyRosters({
  page = 1, limit = 10, search, status, startDate, endDate, createdById,
} = {}) {
  if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("Invalid pagination", 400, "INVALID_PAGINATION");
  }
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip) || skip < 0) {
    throw new AppError("Invalid pagination range", 400, "INVALID_PAGINATION");
  }
  assertDateRange(startDate ?? "0000-01-01", endDate ?? "9999-12-31");
  try {
    const { rosters, total } = await repository.findDutyRosters({
      skip, take: limit, search: search?.trim() || undefined, status,
      startDate: startDate ? calendarDate(startDate) : undefined,
      endDate: endDate ? calendarDate(endDate) : undefined,
      createdById,
    });
    return {
      data: rosters.map(mapSummary),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function getDutyRosterById(id) {
  try {
    return mapRoster(getRosterOrThrow(await repository.findDutyRosterById(id)));
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function replaceDutyRoster(id, data, actorId, audit = {}) {
  requireActor(actorId);
  const { name, startDate, endDate, status, schedule, expectedUpdatedAt } = data;
  assertDateRange(startDate, endDate);
  const input = flattenSchedule(schedule, startDate, endDate);

  try {
    const saved = await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(id));
      ensureDraft(roster);
      ensureVersion(roster, expectedUpdatedAt);
      const shiftMap = await validateEligibility(db, input);
      const { all, usedIds, newDuties } = prepareDuties(input, shiftMap, roster.duties);
      if (status === "PUBLISHED") await validatePublishedConflicts(db, all, id);

      await guardedUpdate(db, roster, expectedUpdatedAt, {
        name,
        startDate: calendarDate(startDate),
        endDate: calendarDate(endDate),
        status,
        ...(status === "PUBLISHED" && { publishedAt: moment.utc().toDate() }),
      });
      await db.deleteDutiesExcept(id, usedIds);
      await db.insertDuties(newDuties.map((d) => ({ ...d, rosterId: id })));
      await db.insertAudit(auditRecord(
        status === "PUBLISHED" ? "ROSTER_PUBLISHED" : "ROSTER_REPLACED",
        id, actorId, audit,
        { previousStatus: roster.status, status, previousDutyCount: roster.duties.length, dutyCount: all.length }
      ));
      return db.findById(id);
    });
    return mapRoster(saved);
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function updateDutyRoster(id, data, actorId, audit = {}) {
  requireActor(actorId);
  const { name, startDate, endDate, status, expectedUpdatedAt } = data;

  try {
    const saved = await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(id));
      ensureDraft(roster);
      ensureVersion(roster, expectedUpdatedAt);
      const from = startDate ?? toDateString(roster.startDate);
      const to = endDate ?? toDateString(roster.endDate);
      assertDateRange(from, to);
      for (const duty of roster.duties) assertDutyInRange(dutyDate(duty), from, to);

      if (status === "PUBLISHED") {
        const assigned = activeDuties(roster);
        await validateEligibility(db, assigned);
        await validatePublishedConflicts(db, assigned, id);
      }

      const changes = {
        ...(name !== undefined && { name }),
        ...(startDate !== undefined && { startDate: calendarDate(startDate) }),
        ...(endDate !== undefined && { endDate: calendarDate(endDate) }),
        ...(status === "PUBLISHED" && {
          status: "PUBLISHED", publishedAt: moment.utc().toDate(),
        }),
      };
      await guardedUpdate(db, roster, expectedUpdatedAt, changes);
      await db.insertAudit(auditRecord(
        status === "PUBLISHED" ? "ROSTER_PUBLISHED" : "ROSTER_UPDATED",
        id, actorId, audit, { changes: Object.fromEntries(
          Object.entries({ name, startDate, endDate, status })
            .filter(([, value]) => value !== undefined)
        ) }
      ));
      return db.findById(id);
    });
    return mapRoster(saved);
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function cancelDutyRoster(id, { reason, expectedUpdatedAt }, actorId, audit = {}) {
  requireActor(actorId);
  try {
    const saved = await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(id));
      if (roster.status === "CANCELLED") {
        throw new AppError("Roster is already cancelled", 409, "ROSTER_ALREADY_CANCELLED");
      }
      ensureVersion(roster, expectedUpdatedAt);
      await guardedUpdate(db, roster, expectedUpdatedAt, {
        status: "CANCELLED", cancelledAt: moment.utc().toDate(),
      }, ["DRAFT", "PUBLISHED"]);
      await db.insertAudit(auditRecord("ROSTER_CANCELLED", id, actorId, audit, {
        previousStatus: roster.status, reason,
      }));
      return db.findById(id);
    });
    return mapRoster(saved);
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function deleteDutyRoster(id, { expectedUpdatedAt }, actorId, audit = {}) {
  requireActor(actorId);
  try {
    return await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(id));
      ensureDraft(roster);
      ensureVersion(roster, expectedUpdatedAt);
      await db.deleteAllDuties(id);
      await db.deleteRoster(id);
      await db.insertAudit(auditRecord("ROSTER_DELETED", id, actorId, audit, {
        name: roster.name, dutyCount: roster.duties.length,
      }));
      return { success: true };
    });
  } catch (error) {
    handleRepositoryError(error);
  }
}

// --------------------------------------------------
// PHASE 2: ROSTER-SCOPED DUTY SERVICES
// --------------------------------------------------
const MAX_ROSTER_DUTIES = MAX_DUTIES;
function getDutyOrThrow(roster, dutyId) {
  const duty = roster.duties.find((item) => item.id === dutyId);
  if (!duty) throw new AppError("Duty not found in this roster", 404, "DUTY_NOT_FOUND");
  return duty;
}

function ensureAssigned(duty) {
  if (duty.status !== "ASSIGNED") {
    throw new AppError("Duty is already cancelled", 409, "DUTY_NOT_ASSIGNED");
  }
}

function ensurePublished(roster) {
  if (roster.status !== "PUBLISHED") {
    throw new AppError("Operation requires a published roster", 409, "ROSTER_NOT_PUBLISHED");
  }
}

function ensureFutureDuty(duty) {
  if (!moment.utc(duty.startsAt).isAfter(moment.utc())) {
    throw new AppError("Only future published duties can be amended", 409, "DUTY_ALREADY_STARTED");
  }
}

function assertRoomForDuties(roster, additional) {
  if (roster.duties.length + additional > MAX_ROSTER_DUTIES) {
    throw new AppError("Maximum 1000 duty records per roster", 400, "ROSTER_TOO_LARGE");
  }
}

function rosterDates(roster) {
  return {
    start: moment.utc(roster.startDate).format("YYYY-MM-DD"),
    end: moment.utc(roster.endDate).format("YYYY-MM-DD"),
  };
}

function assertDateAllowed(roster, date) {
  const range = rosterDates(roster);
  assertDutyInRange(date, range.start, range.end);
}

function toAssignment(input, shiftMap, previous = null) {
  const times = previous &&
    previous.shiftId === input.shiftId &&
    dutyDate(previous) === input.date
    ? { startsAt: previous.startsAt, endsAt: previous.endsAt }
    : actualTimes(input.date, shiftMap.get(input.shiftId));
  return {
    userId: input.userId,
    roleId: input.roleId,
    shiftId: input.shiftId,
    ...times,
  };
}

function currentAssignments(roster, excludedId = null) {
  return roster.duties.filter((d) =>
    d.status === "ASSIGNED" && d.id !== excludedId
  );
}

function formatDuty(duty) {
  return { ...duty, date: dutyDate(duty) };
}

function pagination({ page = 1, limit = 10 }) {
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(skip) || skip < 0) {
    throw new AppError("Invalid pagination", 400, "INVALID_PAGINATION");
  }
  return { skip, take: limit, page, limit };
}

function paginated(result, page, limit, key = "duties") {
  return {
    data: result[key].map(key === "duties" ? formatDuty : (value) => value),
    meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
  };
}

function newestDuty(before, after) {
  const known = new Set(before.duties.map((d) => d.id));
  const added = after.duties.filter((d) => !known.has(d.id));
  if (added.length !== 1) {
    throw new Error("Unexpected number of newly inserted duties");
  }
  return added[0];
}


export async function listRosterDuties(rosterId, query) {
  getRosterOrThrow(await repository.findRosterHeaderById(rosterId));
  const { page, limit, skip, take } = pagination(query);
  const bounds = query.date ? clinicDayBounds(query.date) : null;
  const result = await repository.listRosterDuties({
    rosterId, skip, take,
    userId: query.userId, roleId: query.roleId,
    shiftId: query.shiftId, status: query.status,
    ...(bounds && { startsOnOrAfter: bounds.start, startsBefore: bounds.end }),
  });
  return paginated(result, page, limit);
}

export async function getRosterDuty(rosterId, dutyId) {
  const duty = await repository.findRosterDuty(rosterId, dutyId);
  if (!duty) throw new AppError("Duty not found in this roster", 404, "DUTY_NOT_FOUND");
  return formatDuty(duty);
}

export async function listRosterActivity(rosterId, query) {
  getRosterOrThrow(await repository.findRosterHeaderById(rosterId));
  const { page, limit, skip, take } = pagination(query);
  const result = await repository.listRosterActivity({ rosterId, skip, take });
  return paginated(result, page, limit, "entries");
}

// --------------------------------------------------
// WRITES: every operation uses the same parent roster
// optimistic version lock and atomic audit transaction.
// --------------------------------------------------

export async function addRosterDuties(rosterId, { duties, expectedUpdatedAt }, actorId, audit = {}) {
  requireActor(actorId);
  try {
    return await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(rosterId));
      if (!(["DRAFT", "PUBLISHED"].includes(roster.status))) {
        throw new AppError("Cancelled roster cannot accept duties", 409, "ROSTER_CANCELLED");
      }
      ensureVersion(roster, expectedUpdatedAt);
      assertRoomForDuties(roster, duties.length);
      for (const duty of duties) assertDateAllowed(roster, duty.date);
      const shifts = await validateEligibility(db, duties);
      const added = duties.map((duty) => toAssignment(duty, shifts));
      validateInternalOverlap([...currentAssignments(roster), ...added]);
      if (roster.status === "PUBLISHED") {
        for (const duty of added) ensureFutureDuty(duty);
        await validatePublishedConflicts(db, added, rosterId);
      }
      await guardedUpdate(db, roster, expectedUpdatedAt, {}, [roster.status]);
      await db.insertDuties(added.map((duty) => ({ ...duty, rosterId })));
      await db.insertAudit(auditRecord("DUTY_ADDED", rosterId, actorId, audit, {
        count: added.length, duties: duties.map((d) => ({ ...d })),
      }));
      const saved = await db.findById(rosterId);
      const oldIds = new Set(roster.duties.map((d) => d.id));
      return {
        rosterId, rosterUpdatedAt: saved.updatedAt,
        duties: saved.duties.filter((d) => !oldIds.has(d.id)).map(formatDuty),
      };
    });
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function updateRosterDuty(rosterId, dutyId, data, actorId, audit = {}) {
  requireActor(actorId);
  const { expectedUpdatedAt, ...changes } = data;
  try {
    return await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(rosterId));
      ensureDraft(roster);
      ensureVersion(roster, expectedUpdatedAt);
      const oldDuty = getDutyOrThrow(roster, dutyId);
      ensureAssigned(oldDuty);
      const input = {
        userId: changes.userId ?? oldDuty.userId,
        roleId: changes.roleId ?? oldDuty.roleId,
        shiftId: changes.shiftId ?? oldDuty.shiftId,
        date: changes.date ?? dutyDate(oldDuty),
      };
      assertDateAllowed(roster, input.date);
      const shifts = await validateEligibility(db, [input]);
      const replacement = toAssignment(input, shifts, oldDuty);
      validateInternalOverlap([...currentAssignments(roster, dutyId), replacement]);
      await guardedUpdate(db, roster, expectedUpdatedAt, {});
      const updated = await db.updateDutyIfAssigned(rosterId, dutyId, {
        ...replacement, updatedAt: moment.utc().toDate(),
      });
      if (updated.count !== 1) throw new AppError("Duty changed concurrently", 409, "DUTY_MODIFIED");
      await db.insertAudit(auditRecord("DUTY_UPDATED", rosterId, actorId, audit, {
        dutyId, previous: {
          userId: oldDuty.userId, roleId: oldDuty.roleId,
          shiftId: oldDuty.shiftId, date: dutyDate(oldDuty),
        }, updated: input,
      }));
      const saved = await db.findById(rosterId);
      return {
        rosterUpdatedAt: saved.updatedAt,
        duty: formatDuty(getDutyOrThrow(saved, dutyId)),
      };
    });
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function deleteRosterDuty(rosterId, dutyId, { expectedUpdatedAt }, actorId, audit = {}) {
  requireActor(actorId);
  try {
    return await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(rosterId));
      ensureDraft(roster);
      ensureVersion(roster, expectedUpdatedAt);
      const duty = getDutyOrThrow(roster, dutyId);
      ensureAssigned(duty);
      await guardedUpdate(db, roster, expectedUpdatedAt, {});
      const deleted = await db.deleteDraftDuty(rosterId, dutyId);
      if (deleted.count !== 1) throw new AppError("Duty changed concurrently", 409, "DUTY_MODIFIED");
      await db.insertAudit(auditRecord("DUTY_DELETED", rosterId, actorId, audit, {
        dutyId, userId: duty.userId, roleId: duty.roleId, shiftId: duty.shiftId,
        date: dutyDate(duty),
      }));
      const saved = await db.findById(rosterId);
      return { rosterId, rosterUpdatedAt: saved.updatedAt, deletedDutyId: dutyId };
    });
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function cancelRosterDuty(rosterId, dutyId, { expectedUpdatedAt, reason }, actorId, audit = {}) {
  requireActor(actorId);
  try {
    return await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(rosterId));
      ensurePublished(roster);
      ensureVersion(roster, expectedUpdatedAt);
      const duty = getDutyOrThrow(roster, dutyId);
      ensureAssigned(duty);
      ensureFutureDuty(duty);
      await guardedUpdate(db, roster, expectedUpdatedAt, {}, ["PUBLISHED"]);
      const changed = await db.cancelDuty(rosterId, dutyId, moment.utc().toDate());
      if (changed.count !== 1) throw new AppError("Duty changed concurrently", 409, "DUTY_MODIFIED");
      await db.insertAudit(auditRecord("DUTY_CANCELLED", rosterId, actorId, audit, {
        dutyId, reason, userId: duty.userId, date: dutyDate(duty),
      }));
      const saved = await db.findById(rosterId);
      return {
        rosterUpdatedAt: saved.updatedAt,
        duty: formatDuty(getDutyOrThrow(saved, dutyId)),
      };
    });
  } catch (error) {
    handleRepositoryError(error);
  }
}

export async function replaceRosterDuty(rosterId, dutyId, data, actorId, audit = {}) {
  requireActor(actorId);
  const { expectedUpdatedAt, reason, ...changes } = data;
  try {
    return await repository.withTransaction(async (db) => {
      const roster = getRosterOrThrow(await db.findById(rosterId));
      ensurePublished(roster);
      ensureVersion(roster, expectedUpdatedAt);
      assertRoomForDuties(roster, 1);
      const previous = getDutyOrThrow(roster, dutyId);
      ensureAssigned(previous);
      ensureFutureDuty(previous);
      const input = {
        userId: changes.userId,
        roleId: changes.roleId ?? previous.roleId,
        shiftId: changes.shiftId ?? previous.shiftId,
        date: changes.date ?? dutyDate(previous),
      };
      assertDateAllowed(roster, input.date);
      const shifts = await validateEligibility(db, [input]);
      const replacement = toAssignment(input, shifts, previous);
      ensureFutureDuty(replacement);
      if (replacement.userId === previous.userId &&
          replacement.roleId === previous.roleId &&
          replacement.startsAt.getTime() === previous.startsAt.getTime()) {
        // Unique constraint also applies to cancelled rows in the current schema.
        throw new AppError("Replacement must change staff, role, or start time", 409, "DUTY_REPLACEMENT_UNCHANGED");
      }
      validateInternalOverlap([...currentAssignments(roster, dutyId), replacement]);
      await validatePublishedConflicts(db, [replacement], rosterId);
      await guardedUpdate(db, roster, expectedUpdatedAt, {}, ["PUBLISHED"]);
      const cancelled = await db.cancelDuty(rosterId, dutyId, moment.utc().toDate());
      if (cancelled.count !== 1) throw new AppError("Duty changed concurrently", 409, "DUTY_MODIFIED");
      await db.insertDuties([{ ...replacement, rosterId }]);
      const saved = await db.findById(rosterId);
      const newDuty = newestDuty(roster, saved);
      await db.insertAudit(auditRecord("DUTY_REPLACED", rosterId, actorId, audit, {
        originalDutyId: dutyId, replacementDutyId: newDuty.id, reason,
        previous: { userId: previous.userId, roleId: previous.roleId,
          shiftId: previous.shiftId, date: dutyDate(previous) },
        replacement: input,
      }));
      return {
        rosterUpdatedAt: saved.updatedAt,
        cancelledDuty: formatDuty(getDutyOrThrow(saved, dutyId)),
        replacementDuty: formatDuty(newDuty),
      };
    });
  } catch (error) {
    handleRepositoryError(error);
  }
}

// --------------------------------------------------
// VALIDATE PROPOSED ROSTER WITHOUT WRITING
// --------------------------------------------------
// Intended for a pre-publish/pre-save UI check. Writes must run the
// same checks again; dry-run results are not a reservation of slots.
export async function validateDutyRoster(data, actorId) {
  requireActor(actorId);
  const { rosterId, expectedUpdatedAt, startDate, endDate, status, schedule } = data;
  let input = [];
  try {
    assertDateRange(startDate, endDate);
    input = flattenSchedule(schedule, startDate, endDate);
    return await repository.withTransaction(async (db) => {
      let existingDuties = [];
      if (rosterId) {
        const roster = getRosterOrThrow(await db.findById(rosterId));
        ensureDraft(roster);
        ensureVersion(roster, expectedUpdatedAt);
        existingDuties = roster.duties;
      }
      const shiftMap = await validateEligibility(db, input);
      const { all } = prepareDuties(input, shiftMap, existingDuties);
      if (status === "PUBLISHED") {
        await validatePublishedConflicts(db, all, rosterId ?? null);
      }
      return {
        valid: true,
        status,
        dutyCount: all.length,
        checkedAgainst: status === "PUBLISHED" ? "PUBLISHED_ROSTERS" : "SAME_ROSTER",
        // This check never persists or locks a future schedule.
      };
    });
  } catch (error) {
    // Business validation failures become actionable UI feedback;
    // unexpected/database failures still reach the global error handler.
    if (error instanceof AppError &&
        ["DUTY_OVERLAP", "DUPLICATE_DUTY", "DUTY_OUTSIDE_ROSTER",
         "INVALID_ROSTER_DATES", "DUPLICATE_SCHEDULE_DATE",
         "STAFF_NOT_ELIGIBLE", "ROLE_NOT_ELIGIBLE", "SHIFT_NOT_ELIGIBLE",
         "INVALID_SHIFT_TIME", "EMPTY_PUBLISHED_ROSTER", "ROSTER_TOO_LARGE"].includes(error.code)) {
      return { valid: false, status, dutyCount: input.length,
        issues: [{ code: error.code, message: error.message }] };
    }
    handleRepositoryError(error);
  }
}
