import { AppError } from "../../../utils/AppError.js";
import * as repository from "../repositories/duties.repository.js";
import { requireActor, dutyDate, clinicDayBounds } from "./dutyScheduling.rules.js";

function pagination({ page = 1, limit = 10 }) {
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(skip) || skip < 0) {
    throw new AppError("Invalid pagination", 400, "INVALID_PAGINATION");
  }
  return { page, limit, skip, take: limit };
}

function timeFilters(from, to) {
  return {
    ...(from && { overlapsFrom: clinicDayBounds(from).start }),
    ...(to && { overlapsTo: clinicDayBounds(to).end }),
  };
}

function pageResult(result, page, limit) {
  return {
    data: result.duties.map((duty) => ({ ...duty, date: dutyDate(duty) })),
    meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
  };
}

export async function listAllDuties(query) {
  const { page, limit, skip, take } = pagination(query);
  const result = await repository.listDuties({
    skip, take,
    userId: query.userId, roleId: query.roleId,
    shiftId: query.shiftId, application: query.application,
    status: query.status, rosterStatus: query.rosterStatus,
    ...timeFilters(query.from, query.to),
  });
  return pageResult(result, page, limit);
}

export async function listMyDuties(userId, query) {
  requireActor(userId);
  const { page, limit, skip, take } = pagination(query);
  const result = await repository.listDuties({
    skip, take, userId, application: query.application,
    status: "ASSIGNED", rosterStatus: "PUBLISHED",
    ...timeFilters(query.from, query.to),
  });
  return pageResult(result, page, limit);
}
