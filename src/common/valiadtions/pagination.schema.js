import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, { error: "Page must be at least 1" }).default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1, { error: "Limit must be at least 1" })
    .max(100, { error: "Limit cannot exceed 100" })
    .default(10),
});
