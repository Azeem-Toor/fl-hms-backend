import { permissionSeed } from "../src/common/permissons.js";
import { prisma } from "../src/config/prisma.js";

async function main() {
  for (const permission of permissionSeed) {
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
