import { z } from "zod";
import { paginationQuerySchema } from "../../../common/valiadtions/pagination.schema.js";

// Use your existing shared application validator if available.
const application = z.enum(["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"]);

export const listPermissionsSchema = z.object({
  query: paginationQuerySchema
    .extend({
      search: z.string().trim().max(100).optional(),
      application: application.optional(),
      sortBy: z.enum(["code", "createdAt"]).default("code"),
      sortOrder: z.enum(["asc", "desc"]).default("asc"),
    })
    .strict(),
});
