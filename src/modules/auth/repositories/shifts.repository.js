import { prisma } from "../../../config/prisma.js";

// --------------------------------------------------
// REPOSITORY ERROR
// --------------------------------------------------

export class ShiftRepositoryError extends Error {
  constructor(code, cause) {
    super("Shift persistence operation failed", { cause });
    this.name = "ShiftRepositoryError";
    this.code = code;
  }
}

function handleDatabaseError(error) {
  if (error instanceof ShiftRepositoryError) {
    throw error;
  }

  const codes = {
    P2002: "UNIQUE_CONSTRAINT",
    P2003: "FOREIGN_KEY_CONSTRAINT",
    P2014: "FOREIGN_KEY_CONSTRAINT",
    P2025: "RECORD_NOT_FOUND",
    P2034: "TRANSACTION_CONFLICT",
    P2028: "TRANSACTION_FAILURE",
    P1008: "DATABASE_TIMEOUT",
  };

  const code = codes[error?.code];

  if (code) {
    throw new ShiftRepositoryError(code, error);
  }

  throw error;
}

// --------------------------------------------------
// SHIFT PROJECTION
// --------------------------------------------------

const shiftSelect = {
  id: true,
  name: true,
  description: true,
  startMinute: true,
  endMinute: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

// --------------------------------------------------
// PERSISTENCE OPERATIONS
// --------------------------------------------------

// Accepting a Prisma client allows the same query
// methods to run against either the normal client
// or a transaction-scoped client.
//
// No business decisions are made in this layer.

function buildQueries(db) {
  return {
    // ----------------------------------------------
    // FIND BY ID
    // ----------------------------------------------

    findById(id) {
      return db.shift.findUnique({
        where: { id },
        select: shiftSelect,
      });
    },

    // ----------------------------------------------
    // FETCH NAMES
    // ----------------------------------------------

    findNames() {
      return db.shift.findMany({
        select: {
          id: true,
          name: true,
        },
      });
    },

    // ----------------------------------------------
    // FETCH ACTIVE SHIFT INTERVALS
    // ----------------------------------------------

    findActiveIntervals(excludeId = null) {
      return db.shift.findMany({
        where: {
          isActive: true,
          ...(excludeId && {
            id: { not: excludeId },
          }),
        },
        select: {
          id: true,
          name: true,
          startMinute: true,
          endMinute: true,
        },
      });
    },

    // ----------------------------------------------
    // INSERT SHIFT
    // ----------------------------------------------

    insert(data) {
      return db.shift.create({
        data,
        select: shiftSelect,
      });
    },

    // ----------------------------------------------
    // UPDATE SHIFT
    // ----------------------------------------------

    update(id, data) {
      return db.shift.update({
        where: { id },
        data,
        select: shiftSelect,
      });
    },

    // ----------------------------------------------
    // COUNT DUTY REFERENCES
    // ----------------------------------------------

    countDuties(shiftId) {
      return db.duty.count({
        where: { shiftId },
      });
    },

    // ----------------------------------------------
    // DELETE SHIFT
    // ----------------------------------------------

    remove(id) {
      return db.shift.delete({
        where: { id },
        select: {
          id: true,
        },
      });
    },

    // ----------------------------------------------
    // INSERT AUDIT LOG
    // ----------------------------------------------

    insertAuditLog(data) {
      return db.authAuditLog.create({
        data,
        select: { id: true },
      });
    },
  };
}

// --------------------------------------------------
// FIND SHIFT BY ID
// --------------------------------------------------

export async function findShiftById(id) {
  try {
    return await buildQueries(prisma).findById(id);
  } catch (error) {
    handleDatabaseError(error);
  }
}

// --------------------------------------------------
// LIST SHIFTS
// --------------------------------------------------

export async function findShifts({ skip, take, search, isActive }) {
  const where = {
    ...(typeof isActive === "boolean" && {
      isActive,
    }),

    ...(search && {
      OR: [
        {
          name: { contains: search },
        },
        {
          description: { contains: search },
        },
      ],
    }),
  };

  try {
    const [shifts, total] = await prisma.$transaction([
      prisma.shift.findMany({
        where,
        skip,
        take,
        select: shiftSelect,
        orderBy: [{ startMinute: "asc" }, { id: "asc" }],
      }),

      prisma.shift.count({ where }),
    ]);

    return {
      shifts,
      total,
    };
  } catch (error) {
    handleDatabaseError(error);
  }
}

// --------------------------------------------------
// TRANSACTION WRAPPER
// --------------------------------------------------

// Business logic stays in the service.
// This wrapper only provides an atomic persistence
// boundary and transaction-scoped query methods.

export async function withTransaction(operation) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const repository = buildQueries(tx);

        return operation(repository);
      },
      {
        maxWait: 5000,
        timeout: 10000,
        isolationLevel: "Serializable",
      }
    );
  } catch (error) {
    handleDatabaseError(error);
  }
}
