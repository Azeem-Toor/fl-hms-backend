// --------------------------------------------------
// ELIGIBLE ROLES
// --------------------------------------------------

export function eligibleRoles(user, application) {
  return (user?.userRoles || [])
    .filter(
      (assignment) =>
        !assignment.revokedAt &&
        assignment.role?.isActive === true &&
        assignment.role.application === application
    )
    .map((assignment) => assignment.role);
}

// --------------------------------------------------
// ROLE SUMMARY
// --------------------------------------------------

export function roleSummary(role) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    application: role.application,
  };
}

// --------------------------------------------------
// USER CONTEXT
// --------------------------------------------------

export function buildUserContext(user, application) {
  const roles = eligibleRoles(user, application);

  // Combine permissions from all matching active roles.
  // Set removes duplicates.
  const permissions = [
    ...new Set(
      roles.flatMap((role) =>
        (role.permissions || [])
          .filter(({ permission }) => permission?.application === application)
          .map(({ permission }) => permission.code)
      )
    ),
  ].sort();

  const roleSummaries = roles.map(roleSummary);

  return {
    user: {
      id: user.id,
      userName: user.userName,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      designation: user.designation,
    },

    context: {
      application,
      roles: roleSummaries,
      permissions,
    },
  };
}
