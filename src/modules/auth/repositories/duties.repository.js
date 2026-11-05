import { prisma } from "../../../config/prisma.js";


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

export async function listDuties(filters) {
  const { skip, take, ...criteria } = filters;
  const where = dutyWhere(criteria);
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

