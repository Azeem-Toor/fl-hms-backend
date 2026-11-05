import { prisma } from "../src/config/prisma.js";

const permissions = [
  {
    code: "staff.read",
    description: "View staff records",
    application: "ADMIN",
  },
  {
    code: "staff.create",
    description: "Create staff accounts",
    application: "ADMIN",
  },
  {
    code: "staff.update",
    description: "Update staff accounts",
    application: "ADMIN",
  },
  {
    code: "roles.manage",
    description: "Manage roles and permissions",
    application: "ADMIN",
  },
  {
    code: "rosters.manage",
    description: "Manage shifts and duty rosters",
    application: "ADMIN",
  },
  {
    code:"receptionist.read",
    description: "View receptionist records",
    application: "RECEPTION",
  }
];

async function main() {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: {
        code: permission.code,
      },
      update: {
        description: permission.description,
        application: permission.application,
      },
      create: permission,
    });
  }

  console.log("Permissions seeded successfully");
}

try {
  await main();
} catch (err) {
  console.error("Permissions seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
