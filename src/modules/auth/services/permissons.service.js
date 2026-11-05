import { AppError } from "../../../utils/AppError.js";
import * as permissonsRepository from "../repositories/permissons.repository.js";

export const listPermissions = async ({
  page = 1,
  limit = 20,
  search,
  application,
  sortBy = "code",
  sortOrder = "asc",
}) => {
  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip) || skip < 0) {
    throw new AppError("Invalid pagination range", 400, "INVALID_PAGINATION");
  }

  const { permissions, total } = await permissonsRepository.findPermissions({
    skip,
    take: limit,
    search,
    application,
    sortBy,
    sortOrder,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: permissions,
    meta: {
      page,
      limit,
      total,
      totalPages,
    //   hasNextPage: page < totalPages,
    //   hasPreviousPage: page > 1,
    },
  };
};
