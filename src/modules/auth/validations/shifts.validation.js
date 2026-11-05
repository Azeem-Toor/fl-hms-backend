import { z } from "zod";
import { paginationQuerySchema } from "../../../common/valiadtions/pagination.schema.js";

// --------------------------------------------------
// COMMON FIELDS
// --------------------------------------------------

const shiftId = z.uuid({
  error: "Shift ID must be a valid UUID",
});

const shiftName = z
  .string({ error: "Shift name is required" })
  .trim()
  .min(2, { error: "Shift name must contain at least 2 characters" })
  .max(80, { error: "Shift name must not exceed 80 characters" });

const description = z
  .string()
  .trim()
  .max(500, { error: "Description must not exceed 500 characters" })
  .nullable();

const minute = (field) =>
  z
    .number({ error: `${field} must be a number` })
    .int({ error: `${field} must be an integer` })
    .min(0, { error: `${field} must be at least 0` })
    .max(1439, { error: `${field} must not exceed 1439` });

const startMinute = minute("Start minute");
const endMinute = minute("End minute");

const idParams = z
  .object({
    id: shiftId,
  })
  .strict();

// --------------------------------------------------
// CREATE SHIFT
// --------------------------------------------------

export const createShiftSchema = z.object({
  body: z
    .object({
      name: shiftName,
      description: description.optional(),
      startMinute,
      endMinute,
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((data) => data.startMinute !== data.endMinute, {
      path: ["endMinute"],
      error: "Start and end times cannot be equal",
    }),
});

// --------------------------------------------------
// LIST SHIFTS
// --------------------------------------------------

export const listShiftsSchema = z.object({
  query: paginationQuerySchema
    .extend({
      search: z
        .string()
        .trim()
        .max(100, { error: "Search must not exceed 100 characters" })
        .optional(),

      isActive: z
        .enum(["true", "false"], {
          error: "isActive must be true or false",
        })
        .optional(),
    })
    .strict(),
});

// --------------------------------------------------
// GET SHIFT
// --------------------------------------------------

export const getShiftSchema = z.object({
  params: idParams,
});

// --------------------------------------------------
// UPDATE SHIFT
// --------------------------------------------------

export const updateShiftSchema = z.object({
  params: idParams,

  body: z
    .object({
      name: shiftName.optional(),
      description: description.optional(),
      startMinute: startMinute.optional(),
      endMinute: endMinute.optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      error: "At least one field is required for update",
    })
    .refine(
      (data) =>
        data.startMinute === undefined ||
        data.endMinute === undefined ||
        data.startMinute !== data.endMinute,
      {
        path: ["endMinute"],
        error: "Start and end times cannot be equal",
      }
    ),
});

// --------------------------------------------------
// DELETE SHIFT
// --------------------------------------------------

export const deleteShiftSchema = z.object({
  params: idParams,
});
