import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

// Hash below is used only for nonexistent users to reduce username timing leakage.
// Computed once at startup so bcrypt work is still performed for unknown usernames.
const dummyHash = bcrypt.hashSync("FL-HMS-nonexistent-account-dummy", env.auth.bcryptRounds);

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash || dummyHash);
}

export function hashPassword(password) {
  return bcrypt.hash(password, env.auth.bcryptRounds);
}
