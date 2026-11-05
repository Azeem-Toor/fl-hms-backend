# FL-HMS Backend

Backend API for **FL-HMS (Hospital Management System)**, built with **Node.js**, **Express**, **JavaScript**, **Prisma ORM**, and **SQLite**.

The codebase follows a modular, layered structure that keeps HTTP handling, business logic, validation, and database access separate.

## Current scope

- Authentication and JWT access/refresh tokens
- Staff management and account controls
- Role-based access control (roles and permissions)
- Duties, shifts, and duty rosters
- Centralized validation, logging, and error handling
- Domain folders for upcoming Doctor and Pharmacy features

> **Note:** The `doctor` and `pharmacy` directories are present in the project structure; their implemented features are not documented here yet.

## Tech stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js-24.22.0 |
| API framework | Express |
| Language | JavaScript (ES modules) |
| ORM | Prisma |
| Database | SQLite |
| Authentication | JWT and password hashing |
| Validation | Centralized route validation |

## Project structure

```text
.
├── prisma/                   # Prisma schema and migrations
├── storage/                  # Local runtime data (not committed)
├── src/
│   ├── common/
│   │   └── valiadtions/      # Shared schemas (current folder name)
│   ├── config/               # Environment, logger, Prisma client
│   ├── middlewares/          # Authentication, authorization, validation, errors
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── controllers/   # HTTP request/response handling
│   │   │   ├── repositories/  # Data access
│   │   │   ├── services/      # Business logic and scheduling rules
│   │   │   ├── validations/   # Request schemas
│   │   │   └── auth.tokens.js
│   │   ├── doctor/
│   │   └── pharmacy/
│   ├── routes/               # Express route definitions and mounting
│   ├── utils/                # Shared application utilities
│   ├── app.js                # Express app configuration
│   └── server.js             # Server entry point
├── .env.example              # Safe environment variable template
├── .gitignore
├── package.json
└── README.md
```

## Request lifecycle

```text
Client request
    ↓
Express route → middleware (authentication / authorization / validation)
    ↓
Controller → Service → Repository → Prisma → SQLite
    ↓
Response / centralized error handler
```

Controllers should focus on HTTP concerns, services on business rules, and repositories on persistence. Cross-cutting functionality belongs in shared middleware and utilities.

## Getting started

### 1. Prerequisites

- Node.js and npm (use a Node.js version supported by `package.json`)
- Git

### 2. Install dependencies

```bash
git clone <repository-url>
cd <project-directory>
npm install
```

If you already have the project locally, run `npm install` from its root directory.

### 3. Configure environment variables

Create `.env` in the project root from `.env.example`:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux, use `cp .env.example .env`.

Example configuration (**never use example JWT secrets in a deployed environment**):

```dotenv
NODE_ENV=development
PORT=3000
HOST=127.0.0.1

LOG_LEVEL=debug
JSON_BODY_LIMIT=256kb

DATABASE_URL="file:./storage/hms.db"

AUTH_RATE_LIMIT_WINDOW_MINUTES=15
AUTH_LOGIN_RATE_LIMIT=30
AUTH_REFRESH_RATE_LIMIT=120

JWT_ACCESS_SECRET=REPLACE_WITH_A_LONG_RANDOM_ACCESS_SECRET
JWT_REFRESH_SECRET=REPLACE_WITH_A_DIFFERENT_LONG_RANDOM_REFRESH_SECRET
JWT_ISSUER=fl-hms
JWT_AUDIENCE=fl-hms-client
JWT_ACCESS_TTL_SECONDS=7200
JWT_REFRESH_TTL_SECONDS=86400
AUTH_BCRYPT_ROUNDS=12
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCK_MINUTES=15
```

Generate **two independent** random JWT secrets, for example:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run the command twice and set the two values in `.env`.

**SQLite path check:** If your Prisma schema is at `prisma/schema.prisma` and its datasource reads `DATABASE_URL`, Prisma normally resolves a relative SQLite file path from the schema directory. In that layout, `file:./storage/hms.db` points to `prisma/storage/hms.db`, **not** the root-level `storage/hms.db`. To target root-level `storage/hms.db`, use `DATABASE_URL="file:../storage/hms.db"`. Verify the location against your actual Prisma configuration before running migrations.

### 4. Prepare the database

```bash
npx prisma generate
npx prisma migrate dev
```

These commands assume the project has a configured Prisma schema and migrations. If migrations have not been created yet, define/review the schema before choosing a migration strategy. **Do not reset an existing database with real records.**

### 5. Start the API

Check available npm scripts:

```bash
npm run
```

Run the development script defined in your `package.json` (commonly `npm run dev`). With the sample environment settings, the server is configured for `127.0.0.1:3000`.

## Environment variable reference

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime environment |
| `HOST`, `PORT` | Bind address and port |
| `LOG_LEVEL` | Application log verbosity |
| `JSON_BODY_LIMIT` | Maximum JSON request body size |
| `DATABASE_URL` | Prisma database connection URL |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | Authentication rate-limit window |
| `AUTH_LOGIN_RATE_LIMIT` | Login attempt rate limit |
| `AUTH_REFRESH_RATE_LIMIT` | Refresh request rate limit |
| `JWT_ACCESS_SECRET` | Signs/verifies access tokens |
| `JWT_REFRESH_SECRET` | Signs/verifies refresh tokens |
| `JWT_ISSUER`, `JWT_AUDIENCE` | JWT issuer/audience claims |
| `JWT_ACCESS_TTL_SECONDS` | Access token lifetime (7200 = 2 hours) |
| `JWT_REFRESH_TTL_SECONDS` | Refresh token lifetime (86400 = 24 hours) |
| `AUTH_BCRYPT_ROUNDS` | Password-hashing work factor |
| `AUTH_MAX_FAILED_ATTEMPTS` | Failed-login threshold |
| `AUTH_LOCK_MINUTES` | Account lock duration |

## Modules and responsibilities

| Area | Responsibility |
| --- | --- |
| Auth | Login, token handling, password-related workflows |
| Staff | Staff account management |
| Roles & permissions | Authorization and role assignments |
| Duties | Duty definitions and management |
| Shifts | Shift definitions and management |
| Duty rosters | Scheduling and roster rules |
| Doctor / Pharmacy | Reserved domain directories; document as implemented |

HTTP route definitions live under `src/routes/`. The actual paths, methods, request bodies, and response contracts should be taken from those route files rather than assumed from this README.

## Security and data handling

- Never commit `.env`, JWT secrets, local databases, backups, or patient uploads.
- Keep `.env.example` limited to non-secret placeholders.
- Use separate, strong access and refresh signing secrets.
- Restrict who can access the server and its database/storage directories.
- Avoid logging tokens, passwords, patient identifiers, or sensitive medical data.
- Back up the SQLite database and any required uploaded files securely; Git is **not** a backup strategy.
- Review rate limits and token lifetimes before production deployment.
- `HOST=127.0.0.1` binds to the local machine only. Configure production networking and HTTPS deliberately.

## Development conventions

1. Define request validation in the relevant `validations/` file.
2. Register endpoints in `src/routes/`.
3. Keep controllers focused on request handling.
4. Put business logic in services and database queries in repositories.
5. Reuse shared middleware for authentication, authorization, and errors.
6. Add Prisma schema changes through reviewed migrations; commit migration files.

## Git tracking

Track source code, `package.json`, lockfiles, Prisma schema/migrations, and `.env.example`. Ignore `node_modules/`, `.env`, runtime storage, logs, and local SQLite databases using `.gitignore`.

---

**Project:** FL-HMS · **Component:** Backend API
