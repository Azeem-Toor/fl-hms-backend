import { z } from "zod";
import { paginationQuerySchema } from "../../../common/valiadtions/pagination.schema.js";

const uuid = z.uuid({ error: "Must be a valid UUID" });
const calendarDate = z.iso.date({ error: "Date must be YYYY-MM-DD" });
const version = z.iso.datetime({ offset: true, error: "expectedUpdatedAt must be an ISO datetime" });
const name = z.string().trim().min(2).max(120);
const reason = z.string().trim().min(3).max(500);

const dutyInput = z.object({
  userId: uuid,
  roleId: uuid,
  shiftId: uuid,
}).strict();

const scheduleDay = z.object({
  date: calendarDate,
  duties: z.array(dutyInput).max(200),
}).strict();

const schedule = z.array(scheduleDay).max(366).superRefine((days, ctx) => {
  const seen = new Set();
  for (let i = 0; i < days.length; i++) {
    if (seen.has(days[i].date)) {
      ctx.addIssue({ code: "custom", path: [i, "date"], message: "Duplicate schedule date" });
    }
    seen.add(days[i].date);
  }
});

const datesInOrder = (body) => body.startDate <= body.endDate;
const rosterFields = {
  name,
  startDate: calendarDate,
  endDate: calendarDate,
};
const rosterIdParams = z.object({ id: uuid }).strict();

export const createDutyRosterSchema = z.object({
  body: z.object({
    ...rosterFields,
    status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
    schedule: schedule.default([]),
  }).strict().refine(datesInOrder, {
    path: ["endDate"], message: "endDate must be on or after startDate",
  }),
});

export const listDutyRostersSchema = z.object({
  query: paginationQuerySchema.extend({
    search: z.string().trim().max(100).optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
    startDate: calendarDate.optional(),
    endDate: calendarDate.optional(),
    createdById: uuid.optional(),
  }).strict().refine(
    (q) => !q.startDate || !q.endDate || q.startDate <= q.endDate,
    { path: ["endDate"], message: "endDate must be on or after startDate" }
  ),
});

export const getDutyRosterSchema = z.object({ params: rosterIdParams });

export const replaceDutyRosterSchema = z.object({
  params: rosterIdParams,
  body: z.object({
    ...rosterFields,
    status: z.enum(["DRAFT", "PUBLISHED"]),
    schedule,
    expectedUpdatedAt: version,
  }).strict().refine(datesInOrder, {
    path: ["endDate"], message: "endDate must be on or after startDate",
  }),
});

export const updateDutyRosterSchema = z.object({
  params: rosterIdParams,
  body: z.object({
    name: name.optional(),
    startDate: calendarDate.optional(),
    endDate: calendarDate.optional(),
    status: z.literal("PUBLISHED").optional(),
    expectedUpdatedAt: version,
  }).strict().refine(
    ({ name, startDate, endDate, status }) =>
      name !== undefined || startDate !== undefined || endDate !== undefined || status !== undefined,
    { message: "At least one roster field must be updated" }
  ),
});

export const cancelDutyRosterSchema = z.object({
  params: rosterIdParams,
  body: z.object({
    reason,
    expectedUpdatedAt: version,
  }).strict(),
});

export const deleteDutyRosterSchema = z.object({
  params: rosterIdParams,
  query: z.object({ expectedUpdatedAt: version }).strict(),
});

// --------------------------------------------------
// PHASE 2: ROSTER DUTY OPERATIONS
// --------------------------------------------------
const paramsDuty = z.object({ id: uuid, dutyId: uuid }).strict();
const assignDutyInput = z.object({
  userId: uuid, roleId: uuid, shiftId: uuid, date: calendarDate,
}).strict();

export const listRosterDutiesSchema = z.object({
  params: rosterIdParams,
  query: paginationQuerySchema.extend({
    userId: uuid.optional(), roleId: uuid.optional(), shiftId: uuid.optional(),
    status: z.enum(["ASSIGNED", "CANCELLED"]).optional(),
    date: calendarDate.optional(),
  }).strict(),
});

export const getRosterDutySchema = z.object({ params: paramsDuty });

export const addRosterDutiesSchema = z.object({
  params: rosterIdParams,
  body: z.object({
    expectedUpdatedAt: version,
    duties: z.array(assignDutyInput).min(1, { error: "At least one duty is required" }).max(200),
  }).strict(),
});

export const updateRosterDutySchema = z.object({
  params: paramsDuty,
  body: z.object({
    expectedUpdatedAt: version,
    userId: uuid.optional(), roleId: uuid.optional(), shiftId: uuid.optional(),
    date: calendarDate.optional(),
  }).strict().refine(
    ({ userId, roleId, shiftId, date }) =>
      userId !== undefined || roleId !== undefined || shiftId !== undefined || date !== undefined,
    { message: "At least one assignment field is required" }
  ),
});

export const deleteRosterDutySchema = z.object({
  params: paramsDuty,
  query: z.object({ expectedUpdatedAt: version }).strict(),
});

export const cancelRosterDutySchema = z.object({
  params: paramsDuty,
  body: z.object({ expectedUpdatedAt: version, reason }).strict(),
});

export const replaceRosterDutySchema = z.object({
  params: paramsDuty,
  body: z.object({
    expectedUpdatedAt: version,
    userId: uuid, roleId: uuid.optional(), shiftId: uuid.optional(),
    date: calendarDate.optional(), reason,
  }).strict(),
});

export const listRosterActivitySchema = z.object({
  params: rosterIdParams,
  query: paginationQuerySchema.strict(),
});

// Dry-run validation for new rosters or existing draft replacements.
// Existing drafts require a roster version to prevent validating stale data.
export const validateDutyRosterSchema = z.object({
  body: z.object({
    rosterId: uuid.optional(),
    expectedUpdatedAt: version.optional(),
    ...rosterFields,
    status: z.enum(["DRAFT", "PUBLISHED"]),
    schedule,
  }).strict().superRefine((data, ctx) => {
    if (data.startDate > data.endDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must be on or after startDate" });
    }
    if (Boolean(data.rosterId) !== Boolean(data.expectedUpdatedAt)) {
      ctx.addIssue({ code: "custom", path: ["expectedUpdatedAt"], message: "rosterId and expectedUpdatedAt must be provided together" });
    }
  }),
});
