import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.logLevel,

  base: {
    service: "fl-hms-api",
  },

  ...(env.nodeEnv === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
});
