import { prisma } from "../../../config/prisma.js";

export const findPermissions = async ({ skip, take, search, application, sortBy, sortOrder }) => {
  const where = {
    ...(application && { application }),

    ...(search && {
      OR: [{ code: { contains: search } }, { description: { contains: search } }],
    }),
  };

  const orderBy = [{ [sortBy]: sortOrder }, { id: "asc" }];

  const [permissions, total] = await prisma.$transaction([
    prisma.permission.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        code: true,
        description: true,
        application: true,
        createdAt: true,
      },
    }),

    prisma.permission.count({ where }),
  ]);

  return { permissions, total };
};
