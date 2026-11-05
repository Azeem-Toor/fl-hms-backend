import moment from "moment";
import { AppError } from "../../../utils/AppError.js";

// Default: Pakistan (UTC+05:00). Fixed offsets do not support daylight-saving transitions.
// For clinics in DST timezones, replace this setting/conversion with an IANA timezone implementation.
const CLINIC_UTC_OFFSET_MINUTES = Number(process.env.CLINIC_UTC_OFFSET_MINUTES ?? 300);
if (!Number.isSafeInteger(CLINIC_UTC_OFFSET_MINUTES) ||
    CLINIC_UTC_OFFSET_MINUTES < -720 || CLINIC_UTC_OFFSET_MINUTES > 840) {
  throw new Error("CLINIC_UTC_OFFSET_MINUTES must be a valid UTC offset in minutes");
}
const DATE_FORMAT = "YYYY-MM-DD";


export function requireActor(actorId) {
  if (typeof actorId !== "string" || !actorId.trim()) {
    throw new AppError("Authenticated actor is required", 401, "UNAUTHORIZED");
  }
}

export function calendarDate(value) {
  const parsed = moment.utc(value, DATE_FORMAT, true);
  if (!parsed.isValid()) {
    throw new AppError("Invalid calendar date", 400, "INVALID_ROSTER_DATE");
  }
  return parsed.startOf("day").toDate();
}

export function toDateString(date) {
  return moment.utc(date).format(DATE_FORMAT);
}

export function dutyDate(duty) {
  return moment.utc(duty.startsAt).add(CLINIC_UTC_OFFSET_MINUTES, "minutes").format(DATE_FORMAT);
}

export function assertDateRange(startDate, endDate) {
  if (startDate > endDate) {
    throw new AppError("Roster end date must be on or after start date", 400, "INVALID_ROSTER_DATES");
  }
}

export function assertDutyInRange(date, startDate, endDate) {
  if (date < startDate || date > endDate) {
    throw new AppError(
      `Duty date ${date} falls outside the roster date range`,
      400, "DUTY_OUTSIDE_ROSTER"
    );
  }
}

export function actualTimes(date, shift) {
  const { startMinute, endMinute } = shift;
  if (![startMinute, endMinute].every((n) => Number.isSafeInteger(n) && n >= 0 && n < 1440) ||
      startMinute === endMinute) {
    throw new AppError("Shift has invalid start/end times", 409, "INVALID_SHIFT_TIME");
  }
  const duration = (endMinute - startMinute + 1440) % 1440;
  const startsAt = moment.utc(date, DATE_FORMAT, true)
    .add(startMinute - CLINIC_UTC_OFFSET_MINUTES, "minutes").toDate();
  const endsAt = moment.utc(startsAt).add(duration, "minutes").toDate();
  return { startsAt, endsAt };
}


export function validateInternalOverlap(duties) {
  const byUser = new Map();
  for (const duty of duties) {
    if (!byUser.has(duty.userId)) byUser.set(duty.userId, []);
    byUser.get(duty.userId).push(duty);
  }
  for (const [userId, items] of byUser) {
    items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let index = 1; index < items.length; index++) {
      if (items[index - 1].endsAt > items[index].startsAt) {
        throw new AppError(
          `Staff member ${userId} has overlapping duties`,
          409, "DUTY_OVERLAP"
        );
      }
    }
  }
}

export async function validateEligibility(db, duties) {
  if (!duties.length) return new Map();
  const userIds = [...new Set(duties.map((d) => d.userId))];
  const roleIds = [...new Set(duties.map((d) => d.roleId))];
  const shiftIds = [...new Set(duties.map((d) => d.shiftId))];

  // Keep reads sequential within Prisma's single-connection SQLite transaction.
  const users = await db.findUsers(userIds);
  const roles = await db.findRoles(roleIds);
  const shifts = await db.findShifts(shiftIds);
  const usersMap = new Map(users.map((u) => [u.id, u]));
  const rolesMap = new Map(roles.map((r) => [r.id, r]));
  const shiftsMap = new Map(shifts.map((s) => [s.id, s]));

  for (const duty of duties) {
    const user = usersMap.get(duty.userId);
    const role = rolesMap.get(duty.roleId);
    const shift = shiftsMap.get(duty.shiftId);

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new AppError(`Staff member ${duty.userId} is inactive or unavailable`, 400, "STAFF_NOT_ELIGIBLE");
    }
    if (!role || !role.isActive || !user.userRoles.some((r) => r.roleId === role.id)) {
      throw new AppError(`Role ${duty.roleId} is not active or assigned to staff`, 400, "ROLE_NOT_ELIGIBLE");
    }
    if (!shift || !shift.isActive) {
      throw new AppError(`Shift ${duty.shiftId} is inactive or unavailable`, 400, "SHIFT_NOT_ELIGIBLE");
    }
  }
  return shiftsMap;
}

export async function validatePublishedConflicts(db, duties, excludeRosterId = null) {
  if (!duties.length) {
    throw new AppError("A published roster must contain at least one assigned duty", 400, "EMPTY_PUBLISHED_ROSTER");
  }
  validateInternalOverlap(duties);
  const from = new Date(Math.min(...duties.map((d) => d.startsAt.getTime())));
  const to = new Date(Math.max(...duties.map((d) => d.endsAt.getTime())));
  const userIds = [...new Set(duties.map((d) => d.userId))];
  const existing = await db.findDutyCandidates({
    userIds, from, to, excludeRosterId,
    dutyStatus: "ASSIGNED", rosterStatus: "PUBLISHED",
  });
  const grouped = new Map();
  for (const record of existing) {
    if (!grouped.has(record.userId)) grouped.set(record.userId, []);
    grouped.get(record.userId).push(record);
  }
  for (const duty of duties) {
    if ((grouped.get(duty.userId) ?? []).some(
      (other) => other.startsAt < duty.endsAt && other.endsAt > duty.startsAt
    )) {
      throw new AppError(
        `Staff ${duty.userId} is already assigned to a published duty in this period`,
        409, "DUTY_OVERLAP"
      );
    }
  }
}


export function auditRecord(action, rosterId, actorId, audit, metadata) {
  return {
    action,
    outcome: "SUCCESS",
    actorId,
    application: "ADMIN",
    entityType: "DUTY_ROSTER",
    entityId: rosterId,
    requestId: audit?.requestId ?? null,
    ipAddress: audit?.ipAddress ?? null,
    userAgent: audit?.userAgent ?? null,
    metadata,
    createdAt: moment.utc().toDate(),
  };
}


export function getRosterOrThrow(roster) {
  if (!roster) throw new AppError("Roster not found", 404, "ROSTER_NOT_FOUND");
  return roster;
}

export function ensureDraft(roster) {
  if (roster.status !== "DRAFT") {
    throw new AppError("Only draft rosters can be edited or deleted", 409, "ROSTER_NOT_DRAFT");
  }
}

export function ensureVersion(roster, expectedUpdatedAt) {
  if (roster.updatedAt.getTime() !== moment.utc(expectedUpdatedAt).valueOf()) {
    throw new AppError("Roster has changed. Reload before saving.", 409, "ROSTER_MODIFIED");
  }
}

export function nextVersion(roster) {
  return new Date(Math.max(moment.utc().valueOf(), roster.updatedAt.getTime() + 1));
}

export async function guardedUpdate(db, roster, expectedUpdatedAt, data, allowedStatuses = ["DRAFT"]) {
  const changed = await db.updateIfVersionMatches(
    roster.id, new Date(expectedUpdatedAt), allowedStatuses,
    { ...data, updatedAt: nextVersion(roster) }
  );
  if (changed.count !== 1) {
    throw new AppError("Roster has changed. Reload before saving.", 409, "ROSTER_MODIFIED");
  }
}


// The same fixed-offset calendar conversion must be shared by roster creation
// and individual duty endpoints. A different algorithm can cause midnight bugs.
export function clinicDayBounds(date) {
  const midnight = moment.utc(date, DATE_FORMAT, true);
  if (!midnight.isValid()) {
    throw new AppError("Invalid calendar date", 400, "INVALID_ROSTER_DATE");
  }
  const start = midnight.subtract(CLINIC_UTC_OFFSET_MINUTES, "minutes").toDate();
  return {
    start,
    end: moment.utc(start).add(1, "day").toDate(),
  };
}
