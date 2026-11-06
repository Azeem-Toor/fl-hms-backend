
const definitions = {
  staff: {
    application: "ADMIN",
    actions: {
      read: "View staff records",
      create: "Create staff accounts",
      update: "Update staff accounts, roles, and status",
      delete: "Delete staff accounts",
    },
  },

  roles: {
    application: "ADMIN",
    actions: {
      read: "View roles",
      create: "Create roles",
      update: "Update roles and assigned permissions",
      delete: "Delete roles",
    },
  },

  permissions: {
    application: "ADMIN",
    actions: {
      read: "View available permissions",
    },
  },

  shifts: {
    application: "ADMIN",
    actions: {
      read: "View shifts",
      create: "Create shifts",
      update: "Update shifts",
      delete: "Delete shifts",
    },
  },

  rosters: {
    application: "ADMIN",
    actions: {
      read: "View duty rosters and activity history",
      create: "Create and validate duty rosters",
      update: "Update, publish, and cancel duty rosters",
      delete: "Delete draft duty rosters",
    },
  },

  duties: {
    application: "ADMIN",
    actions: {
      read: "View duty assignments",
      create: "Create duty assignments",
      update: "Update, cancel, and replace duty assignments",
      delete: "Delete duty assignments",
    },
  },
};
/**
 * Generate permission codes with IntelliSense support.
 *
 * @template {Record<string, {
 *   application: string,
 *   actions: Record<string, string>
 * }>} T
 *
 * @param {T} definitions
 *
 * @returns {{
 *   readonly [R in keyof T]: {
 *     readonly [A in keyof T[R]["actions"]]:
 *       `${R & string}.${A & string}`
 *   }
 * }}
 */
function buildPermissions(definitions) {
  const result = Object.fromEntries(
    Object.entries(definitions).map(([resource, config]) => [
      resource,
      Object.freeze(
        Object.fromEntries(
          Object.keys(config.actions).map((action) => [
            action,
            `${resource}.${action}`,
          ])
        )
      ),
    ])
  );

  return /** @type {any} */ (Object.freeze(result));
}

// Permission codes for API authorization
export const permissions = buildPermissions(definitions);

// Permission records for database seeding
export const permissionSeed = Object.entries(definitions).flatMap(
  ([resource, config]) =>
    Object.entries(config.actions).map(([action, description]) => ({
      code: `${resource}.${action}`,
      description,
      application: config.application,
    }))
);
