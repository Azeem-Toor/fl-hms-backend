import { z } from "zod";
import { requiredString, newPassword } from "../../../utils/validationFields.js";

const applications = ["ADMIN", "RECEPTION", "DOCTOR", "PHARMACY"];
const application = z.enum(applications, {
  error: (issue) =>
    issue.input === undefined
      ? `Application is required. Allowed: ${applications.join(", ")}`
      : `Application must be one of: ${applications.join(", ")}`,
});

export const loginSchema = z.object({
  body: z
    .object({
      userName: requiredString("Username")
        .trim()
        .min(3, { error: "Username must have at least 3 characters" })
        .max(32, { error: "Username must have at most 32 characters" }),
      password: requiredString("Password")
        .min(1, { error: "Password must not be empty" })
        .refine((v) => Buffer.byteLength(v, "utf8") <= 72, {
          error: "Password must not exceed 72 UTF-8 bytes",
        }),
      application,
    })
    .strict(),
});

export const refreshSchema = z.object({
  body: z
    .object({
      refreshToken: requiredString("Refresh token")
        .max(4096, {
          error: "Refresh token is too long",
        })
        .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, {
          error: "Invalid refresh token format",
        }),
    })
    .strict(),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: requiredString("Current password").min(1),
      newPassword,
    })
    .strict(),
});

export const adminResetPasswordSchema = z.object({
  params: z.object({ userId: z.uuid({ error: "User ID must be a valid UUID" }) }),
  body: z.object({ newPassword }).strict(),
});
