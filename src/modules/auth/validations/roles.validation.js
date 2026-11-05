import { z } from "zod";


import { requiredString } from "../../../utils/validationFields.js";
import { paginationQuerySchema } from "../../../common/valiadtions/pagination.schema.js";

// --------------------------------------------------
// COMMON FIELDS
// --------------------------------------------------

const applications = ["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"];

const application = z.enum(applications, {
  error: `Application must be one of: ${applications.join(", ")}`,
});

const roleId = z.uuid({
  error: "Role ID must be a valid UUID",
});

const roleName = requiredString("Role name")
  .trim()
  .min(2, { error: "Role name must have at least 2 characters" })
  .max(80, { error: "Role name must have at most 80 characters" });

const roleCode = requiredString("Role code")
  .trim()
  .toUpperCase()
  .min(3)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, {
    error:
      "Role code must contain uppercase letters, numbers or underscores and start with a letter",
  });

const description = z
  .string()
  .trim()
  .max(500, { error: "Description cannot exceed 500 characters" })
  .nullable();


const permissionIds = z
  .array(z.uuid({ error: "Each permission ID must be a valid UUID" }), {
    error: "Permission IDs are required and must be an array",
  })
  .nonempty({ error: "At least one permission is required" })
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "Duplicate permission IDs are not allowed",
  });


// --------------------------------------------------
// CREATE ROLE
// --------------------------------------------------

export const createRoleSchema = z.object({
  body: z
    .object({
      code: roleCode,
      name: roleName,
      description: description.optional(),
      application,
      permissionIds: permissionIds
    })
    .strict(),
});

// --------------------------------------------------
// LIST ROLES (PAGINATION + FILTERS)
// --------------------------------------------------

export const listRolesSchema = z.object({
  query: paginationQuerySchema
    .extend({
      search: z.string().trim().max(100).optional(),
      application: application.optional(),
      isActive: z.enum(["true", "false"]).optional(),
    })
    .strict(),
});

// --------------------------------------------------
// GET ROLE BY ID
// --------------------------------------------------

export const getRoleSchema = z.object({
  params: z
    .object({
      id: roleId,
    })
    .strict(),
});

// --------------------------------------------------
// UPDATE ROLE / ACTIVATE / DEACTIVATE
// --------------------------------------------------

export const updateRoleSchema = z.object({
  params: z
    .object({
      id: roleId,
    })
    .strict(),

  body: z
    .object({
      name: roleName.optional(),
      description: description.optional(),
      isActive: z.boolean().optional(),
      permissionIds: permissionIds.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      error: "At least one field is required for update",
    }),
});

// --------------------------------------------------
// DELETE ROLE
// --------------------------------------------------

export const deleteRoleSchema = z.object({
  params: z
    .object({
      id: roleId,
    })
    .strict(),
});
