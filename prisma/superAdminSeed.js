import "dotenv/config";

import bcrypt from "bcryptjs";
import { input, password as passwordPrompt, confirm } from "@inquirer/prompts";

import { prisma } from "../src/config/prisma.js";

const SUPER_ADMIN_CODE = "SUPER_ADMIN";

async function findSuperAdmin(db) {
  return db.userRole.findFirst({
    where: {
      role: {
        is: { code: SUPER_ADMIN_CODE },
      },
    },
    select: {
      revokedAt: true,
      user: {
        select: {
          userName: true,
          fullName: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });
}

async function main() {
  // 1. Check before displaying any prompts
  const existing = await findSuperAdmin(prisma);

  if (existing) {
    console.log("\nSuper Administrator already exists.");
    console.log(`Username: ${existing.user.userName}`);
    console.log("No new account was created.");

    if (existing.revokedAt || !existing.user.isActive || existing.user.deletedAt) {
      console.log(
        "Existing administrator is inactive or revoked. " + "Use a controlled recovery process."
      );
    }

    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error("Run the administrator setup in an interactive terminal.");
  }

  // 2. Ensure administrator permissions exist
  const permissionCount = await prisma.permission.count({
    where: { application: "ADMIN" },
  });

  if (permissionCount === 0) {
    throw new Error("No ADMIN permissions found. Run the permissions seed first.");
  }

  console.log("\n=== FL-HMS Super Administrator Setup ===\n");

  // 3. Collect credentials interactively
  const fullName = (
    await input({
      message: "Full name:",
      validate: (value) =>
        value.trim().length >= 3 || "Full name must contain at least 3 characters",
    })
  ).trim();

  const userName = (
    await input({
      message: "Username:",
      default: "superadmin",
      validate: (value) =>
        /^[a-zA-Z0-9_.-]{3,32}$/.test(value.trim()) ||
        "Use 3-32 letters, digits, underscores, dots or hyphens",
    })
  )
    .trim()
    .toLowerCase();

  const email = (
    await input({
      message: "Email (optional):",
      validate: (value) =>
        !value.trim() ||
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ||
        "Enter a valid email address",
    })
  )
    .trim()
    .toLowerCase();

  const password = await passwordPrompt({
    message: "Password:",
    mask: "*",
    validate: (value) => {
      if (value.length < 16) {
        return "Password must be at least 16 characters";
      }

      if (Buffer.byteLength(value, "utf8") > 72) {
        return "Password must not exceed 72 UTF-8 bytes";
      }

      return true;
    },
  });

  await passwordPrompt({
    message: "Confirm password:",
    mask: "*",
    validate: (value) => value === password || "Passwords do not match",
  });

  const approved = await confirm({
    message: "Create Super Administrator?",
    default: false,
  });

  if (!approved) {
    console.log("Setup cancelled. No changes made.");
    return;
  }

  // 4. Hash before starting the database transaction
  const passwordHash = await bcrypt.hash(password, 12);

  // 5. Create the administrator atomically
  const createdUser = await prisma.$transaction(
    async (tx) => {
      // Recheck to prevent duplicate bootstrap attempts
      const alreadyExists = await findSuperAdmin(tx);

      if (alreadyExists) {
        throw new Error("Super Administrator already exists. Setup aborted.");
      }

      // Never elevate an existing user accidentally
      const usernameConflict = await tx.user.findUnique({
        where: { userName },
        select: { id: true },
      });

      if (usernameConflict) {
        throw new Error("Username is already in use");
      }

      const role = await tx.role.upsert({
        where: { code: SUPER_ADMIN_CODE },
        update: {},
        create: {
          code: SUPER_ADMIN_CODE,
          name: "Super Administrator",
          description: "System administrator",
          application: "ADMIN",
          isSystem: true,
          isActive: true,
        },
      });

      if (role.application !== "ADMIN" || !role.isSystem || !role.isActive) {
        throw new Error("Existing SUPER_ADMIN role is incorrectly configured");
      }

      const permissions = await tx.permission.findMany({
        where: { application: "ADMIN" },
        select: { id: true },
      });

      // Assign all currently seeded ADMIN permissions
      for (const permission of permissions) {
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }

      const user = await tx.user.create({
        data: {
          userName,
          fullName,
          email: email || null,
          isActive: true,

          credential: {
            create: {
              passwordHash,
            },
          },

          userRoles: {
            create: {
              roleId: role.id,
            },
          },
        },
      });

      await tx.authAuditLog.create({
        data: {
          targetUserId: user.id,
          action: "SUPER_ADMIN_BOOTSTRAP",
          outcome: "SUCCESS",
          application: "ADMIN",
        },
      });

      return user;
    },
    { timeout: 20000 }
  );

  console.log("\nSuper Administrator created successfully.");
  console.log(`Username: ${createdUser.userName}`);
  console.log("Password is securely hashed in the database.");
}

try {
  await main();
} catch (error) {
  if (error.name === "ExitPromptError") {
    console.log("\nSetup cancelled.");
  } else {
    console.error("\nSuper Admin setup failed:", error.message);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
