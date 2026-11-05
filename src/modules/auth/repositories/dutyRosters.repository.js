import { prisma } from "../../../config/prisma.js";

export class DutyRosterRepositoryError extends Error {
  constructor(code, cause) {
    super("Duty roster persistence operation failed", { cause });
    this.name = "DutyRosterRepositoryError";
    this.code = code;
  }
}

function translateError(error) {
  const codes = {
    P2002: "UNIQUE_CONSTRAINT",
    P2003: "FOREIGN_KEY_CONSTRAINT",
    P2014: "FOREIGN_KEY_CONSTRAINT",
    P2025: "RECORD_NOT_FOUND",
    P2034: "TRANSACTION_CONFLICT",
    P2028: "TRANSACTION_CONFLICT",
    P1008: "TRANSACTION_CONFLICT",
  };
  if (codes[error?.code]) {
    throw new DutyRosterRepositoryError(codes[error.code], error);
  }
  throw error;
}

const summarySelect = {
  id: true, name: true, startDate: true, endDate: true,
  status: true, createdById: true, publishedAt: true,
  cancelledAt: true, createdAt: true, updatedAt: true,
  creator: { select: { id: true, fullName: true, userName: true } },
  _count: { select: { duties: true } },
};

const detailSelect = {
  ...summarySelect,
  duties: {
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: {
      id: true, rosterId: true, userId: true, roleId: true,
      shiftId: true, startsAt: true, endsAt: true,
      status: true, createdAt: true, updatedAt: true,
      user: { select: { id: true, fullName: true, userName: true } },
      role: { select: { id: true, name: true, code: true, application: true } },
      shift: { select: { id: true, name: true } },
    },
  },
};

function transactionalQueries(db) {
  return {
    findById(id) {
      return db.dutyRoster.findUnique({ where: { id }, select: detailSelect });
    },
    createRoster(data) {
      return db.dutyRoster.create({ data, select: { id: true } });
    },
    updateIfVersionMatches(id, expectedUpdatedAt, allowedStatuses, data) {
      return db.dutyRoster.updateMany({
        where: { id, updatedAt: expectedUpdatedAt, status: { in: allowedStatuses } },
        data,
      });
    },
    findUsers(ids) {
      return db.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, isActive: true, deletedAt: true,
          userRoles: {
            where: { revokedAt: null },
            select: { roleId: true },
          },
        },
      });
    },
    findRoles(ids) {
      return db.role.findMany({
        where: { id: { in: ids } },
        select: { id: true, isActive: true, application: true },
      });
    },
    findShifts(ids) {
      return db.shift.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, startMinute: true, endMinute: true, isActive: true },
      });
    },
    findDutyCandidates({ userIds, from, to, dutyStatus, rosterStatus, excludeRosterId }) {
      return db.duty.findMany({
        where: {
          userId: { in: userIds },
          status: dutyStatus,
          startsAt: { lt: to },
          endsAt: { gt: from },
          roster: { is: { status: rosterStatus } },
          ...(excludeRosterId && { rosterId: { not: excludeRosterId } }),
        },
        select: { id: true, userId: true, rosterId: true, startsAt: true, endsAt: true },
      });
    },
    insertDuties(data) {
      if (data.length === 0) return Promise.resolve({ count: 0 });
      return db.duty.createMany({ data });
    },
    deleteDutiesExcept(rosterId, preservedIds) {
      return db.duty.deleteMany({
        where: {
          rosterId,
          ...(preservedIds.length > 0 && { id: { notIn: preservedIds } }),
        },
      });
    },
    deleteAllDuties(rosterId) {
      return db.duty.deleteMany({ where: { rosterId } });
    },
    deleteRoster(id) {
      return db.dutyRoster.delete({ where: { id }, select: { id: true } });
    },
    // Phase 2: persist individual duty amendments using the same transaction
    // and roster version lock as Phase 1.
    updateDutyIfAssigned(rosterId, dutyId, data) {
      return db.duty.updateMany({
        where: { id: dutyId, rosterId, status: "ASSIGNED" }, data,
      });
    },
    deleteDraftDuty(rosterId, dutyId) {
      return db.duty.deleteMany({ where: { id: dutyId, rosterId, status: "ASSIGNED" } });
    },
    cancelDuty(rosterId, dutyId, updatedAt) {
      return db.duty.updateMany({
        where: { id: dutyId, rosterId, status: "ASSIGNED" },
        data: { status: "CANCELLED", updatedAt },
      });
    },
    updateDutyIfAssigned(rosterId, dutyId, data) {
      return db.duty.updateMany({
        where: { id: dutyId, rosterId, status: "ASSIGNED" }, data,
      });
    },
    deleteDraftDuty(rosterId, dutyId) {
      return db.duty.deleteMany({ where: { id: dutyId, rosterId, status: "ASSIGNED" } });
    },
    cancelDuty(rosterId, dutyId, updatedAt) {
      return db.duty.updateMany({
        where: { id: dutyId, rosterId, status: "ASSIGNED" },
        data: { status: "CANCELLED", updatedAt },
      });
    },
    insertAudit(data) {
      return db.authAuditLog.create({ data, select: { id: true } });
    },
  };
}

export async function findDutyRosterById(id) {
  try {
    return await transactionalQueries(prisma).findById(id);
  } catch (error) {
    translateError(error);
  }
}

export async function findDutyRosters({ skip, take, search, status, startDate, endDate, createdById }) {
  const where = {
    ...(status && { status }),
    ...(createdById && { createdById }),
    ...(search && { name: { contains: search } }),
    // Date-range intersection, not just rosters starting inside the filter window.
    ...(startDate && { endDate: { gte: startDate } }),
    ...(endDate && { startDate: { lte: endDate } }),
  };

  try {
    const [rosters, total] = await prisma.$transaction([
      prisma.dutyRoster.findMany({
        where, skip, take,
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
        select: summarySelect,
      }),
      prisma.dutyRoster.count({ where }),
    ]);
    return { rosters, total };
  } catch (error) {
    translateError(error);
  }
}

export async function withTransaction(operation) {
  try {
    return await prisma.$transaction(
      async (tx) => operation(transactionalQueries(tx)),
      { maxWait: 5000, timeout: 10000, isolationLevel: "Serializable" }
    );
  } catch (error) {
    translateError(error);
  }
}

// Roster-scoped read operations
const dutySelect = {
  id: true,
  rosterId: true,
  userId: true,
  roleId: true,
  shiftId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, userName: true } },
  role: { select: { id: true, name: true, code: true, application: true } },
  shift: { select: { id: true, name: true } },
  roster: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
};

// Build DB filters only; authorization and scheduling rules live in the service.
// AND prevents date-range constraints from overwriting one another.
function dutyWhere({
  rosterId, userId, roleId, shiftId, application, status, rosterStatus,
  startsOnOrAfter, startsBefore, overlapsFrom, overlapsTo,
}) {
  const conditions = [];
  if (startsOnOrAfter) conditions.push({ startsAt: { gte: startsOnOrAfter } });
  if (startsBefore) conditions.push({ startsAt: { lt: startsBefore } });
  if (overlapsFrom) conditions.push({ endsAt: { gt: overlapsFrom } });
  if (overlapsTo) conditions.push({ startsAt: { lt: overlapsTo } });
  return {
    ...(rosterId && { rosterId }),
    ...(userId && { userId }),
    ...(roleId && { roleId }),
    ...(shiftId && { shiftId }),
    ...(status && { status }),
    ...(application && { role: { is: { application } } }),
    ...(rosterStatus && { roster: { is: { status: rosterStatus } } }),
    ...(conditions.length > 0 && { AND: conditions }),
  };
}

export function findRosterHeaderById(rosterId) {
  return prisma.dutyRoster.findUnique({
    where: { id: rosterId },
    select: { id: true, status: true },
  });
}

export function findRosterDuty(rosterId, dutyId) {
  return prisma.duty.findFirst({
    where: { id: dutyId, rosterId },
    select: dutySelect,
  });
}

export async function listRosterDuties(filters) {
  const { skip, take, ...criteria } = filters;
  const where = dutyWhere(criteria);
  if (!criteria.rosterId) throw new TypeError("rosterId is required for roster-duty queries");
  const [duties, total] = await prisma.$transaction([
    prisma.duty.findMany({
      where, skip, take,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: dutySelect,
    }),
    prisma.duty.count({ where }),
  ]);
  return { duties, total };
}

export async function listRosterActivity({ rosterId, skip, take }) {
  const where = {
    entityType: "DUTY_ROSTER",
    entityId: rosterId,
    OR: [
      { action: { startsWith: "ROSTER_" } },
      { action: { startsWith: "DUTY_" } },
    ],
  };
  const [entries, total] = await prisma.$transaction([
    prisma.authAuditLog.findMany({
      where, skip, take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, action: true, outcome: true, entityType: true,
        entityId: true, createdAt: true, metadata: true,
        actor: { select: { id: true, fullName: true, userName: true } },
      },
    }),
    prisma.authAuditLog.count({ where }),
  ]);
  return { entries, total };
}
