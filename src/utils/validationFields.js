import { z } from "zod";

export const requiredString = (label) => z.string({
  error: (issue) => issue.input === undefined
    ? `${label} is required`
    : `${label} must be a string`,
});

export const newPassword = requiredString("New password")
  .min(16, { error: "New password must have at least 16 characters" })
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    error: "New password must not exceed 72 UTF-8 bytes (bcrypt limit)",
  });
