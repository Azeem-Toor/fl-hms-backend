import { z } from "zod";
import { paginationQuerySchema } from "../../../common/valiadtions/pagination.schema.js";

const uuid = z.uuid({ error: "Must be a valid UUID" });
const date = z.iso.date({ error: "Date must be YYYY-MM-DD" });
const filters = {
  userId: uuid.optional(), roleId: uuid.optional(), shiftId: uuid.optional(),
  status: z.enum(["ASSIGNED", "CANCELLED"]).optional(),
};
const dateRange = (schema) => schema.refine(
  (q) => !q.from || !q.to || q.from <= q.to,
  { path: ["to"], message: "to must be on or after from" }
);

export const listAllDutiesSchema = z.object({
  query: dateRange(paginationQuerySchema.extend({
    ...filters,
    application: z.enum(["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"]).optional(),
    rosterStatus: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
    from: date.optional(), to: date.optional(),
  }).strict()),
});

export const listMyDutiesSchema = z.object({
  query: dateRange(paginationQuerySchema.extend({
    application: z.enum(["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"]).optional(),
    from: date.optional(), to: date.optional(),
  }).strict()),
});
