import { z } from "zod";
import { paginationQuerySchema } from "../../../common/valiadtions/pagination.schema.js";

const application = z.enum(["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"]);

const idParams = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const password = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes"
  );

const roleIds = z
  .array(z.string().uuid())
  .max(30)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate role IDs are not allowed");

const joiningDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid joining date")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const staffFields = {
  userName: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .toLowerCase(),

  fullName: z.string().trim().min(2).max(150),

  email: z.string().trim().email().max(254).toLowerCase().nullable().optional(),

  phone: z.string().trim().min(1).max(30).nullable().optional(),

  address: z.string().trim().max(500).nullable().optional(),

  designation: z.string().trim().max(100).nullable().optional(),

  salaryMinorUnits: z.number().int().nonnegative().max(2147483647).nullable().optional(),

  joiningDate: joiningDate.nullable().optional(),
};

// --------------------------------------------------
// CREATE STAFF
// --------------------------------------------------

export const createStaffSchema = z.object({
  body: z
    .object({
      ...staffFields,

      password,
      roleIds: roleIds.min(1),
    })
    .strict(),
});

// --------------------------------------------------
// LIST STAFF
// --------------------------------------------------

export const listStaffSchema = z.object({
  query: paginationQuerySchema
    .extend({
      search: z.string().trim().max(100).optional(),

      application: application.optional(),

      roleId: z.string().uuid().optional(),

      isActive: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),

      sortBy: z.enum(["createdAt", "fullName", "userName"]).default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),
});

// --------------------------------------------------
// GET STAFF
// --------------------------------------------------

export const getStaffSchema = z.object({
  params: idParams,
});

// --------------------------------------------------
// UPDATE STAFF
// --------------------------------------------------

export const updateStaffSchema = z.object({
  params: idParams,

  body: z
    .object({
      ...staffFields,

      roleIds: roleIds.optional(),
      isActive: z.boolean().optional(),
    })
    .partial()
    .strict()
    .refine((data) => Object.keys(data).length > 0, "At least one field must be provided"),
});

// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------

export const resetStaffPasswordSchema = z.object({
  params: idParams,

  body: z
    .object({
      password,
    })
    .strict(),
});

// --------------------------------------------------
// DELETE STAFF
// --------------------------------------------------

export const deleteStaffSchema = z.object({
  params: idParams,
});
