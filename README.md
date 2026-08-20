# Clean Nest Drizzle PG

A production-ready **Clean Architecture** boilerplate built with [NestJS](https://nestjs.com/), [Drizzle ORM](https://orm.drizzle.team/), and [PostgreSQL](https://www.postgresql.org/).

---

## Features

- **Clean Architecture** - Separation of concerns with well-organized layers
- **Fastify** - High-performance HTTP server adapter
- **Drizzle ORM** - Type-safe and lightweight ORM for PostgreSQL
- **Authentication** - JWT-based auth with access & refresh tokens
- **Redis Caching** - Built-in caching with Redis via `cache-manager`
- **Email Service** - Nodemailer integration with Handlebars templates
- **API Documentation** - Swagger/OpenAPI with Scalar UI
- **Rate Limiting** - Request throttling with `@nestjs/throttler`
- **Health Checks** - Readiness and liveness probes via `@nestjs/terminus`
- **Background Jobs** - BullMQ for async task processing
- **RBAC** - Roles and permissions gated with `@PermissionAuth("entity:action")` / `@RoleAuth(...)`, resolved per request and cached in Redis
- **Soft Deletes** - `deleted_at` on user rows; deletes stamp a timestamp and every read filters them out
- **Docker Ready** - Pre-configured Docker Compose setup
- **PM2 Deployment** - Per-environment process definitions with one-command deploys
- **Testing** - Jest setup for unit & e2e tests

---

## Tech Stack

| Layer         | Technology                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| **Runtime**   | [Bun](https://bun.sh/) / [Node.js](https://nodejs.org/)                    |
| **Framework** | [NestJS](https://nestjs.com/) with [Fastify](https://fastify.dev/) adapter |
| **ORM**       | [Drizzle ORM](https://orm.drizzle.team/)                                   |
| **Database**  | [PostgreSQL 17](https://www.postgresql.org/)                               |
| **Cache**     | [Redis 8](https://redis.io/)                                               |
| **Queue**     | [BullMQ](https://bullmq.io/)                                               |
| **Auth**      | [Passport.js](http://www.passportjs.org/) + JWT                            |
| **Docs**      | [Swagger](https://swagger.io/) + [Scalar](https://scalar.com/)             |
| **Env**       | [envalid](https://github.com/af/envalid) validation via `getEnv()`         |
| **Process**   | [PM2](https://pm2.keymetrics.io/) (`ecosystem.config.js`)                  |

---

## Project Structure

```
├── src/
│   ├── auth/                 # Authentication module
│   ├── health/               # Health check endpoints
│   ├── settings/             # Settings module (users, roles, permissions)
│   ├── app.module.ts         # Root application module
│   └── main.ts               # Application entry point
├── libs/
│   ├── common/               # @common  - guards, pipes, decorators, mail, cache, ResponseHandler
│   ├── config/               # @config  - env validation, CORS/Helmet/Swagger configs
│   ├── repositories/         # @repositories - db singleton, schema, migrations, repositories
│   └── utils/                # @utils   - hashing, JWT, dates, logging, constants
├── .agents/skills/           # Agent skill bundle (.claude/skills is a symlink to this)
├── .claude/
│   ├── rules/                # Path-scoped coding standards
│   └── commands/             # /commit, /update-todo
├── docker-compose.yml        # Docker services configuration
├── drizzle.config.ts         # Drizzle ORM configuration
├── ecosystem.config.js       # PM2 process definitions per environment
├── Makefile                  # Development commands
└── package.json
```

Shared code lives in `libs/` and is imported through the `@common`, `@config`, `@repositories`, and
`@utils` aliases. Every public export must be re-exported from the lib's `src/index.ts` or the alias
import will not resolve.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0 or [Node.js](https://nodejs.org/) >= 18.0.0
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- [PM2](https://pm2.keymetrics.io/) — only on deploy targets (`bun add -g pm2`, or run the deploy
  commands with `PM2='bunx pm2'`)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/aolus-software/clean-nest-drizzle-pg.git
   cd clean-nest-drizzle-pg
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Update `.env` with your configuration:

   ```env
   APP_NAME="Clean Nest"
   APP_VERSION="1.0.0"
   APP_SECRET=your_secret_key_here
   APP_PORT=8002

   API_DOCS_ENABLED=true

   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db

   FRONTEND_URL=http://localhost:3000

   JWT_SECRET=your_jwt_secret
   JWT_REFRESH_SECRET=your_refresh_secret
   JWT_EXPIRES_IN=1d
   JWT_REFRESH_EXPIRES_IN=7d

   REDIS_HOST=localhost
   REDIS_PORT=6379

   ALLOWED_ORIGINS=http://localhost:3000
   ALLOWED_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
   ALLOWED_HEADERS=Content-Type,Authorization
   CREDENTIALS=false

   # Mail Configuration (optional)
   MAIL_HOST=
   MAIL_PORT=
   MAIL_SECURE=false
   MAIL_USERNAME=
   MAIL_PASSWORD=
   MAIL_FROM="noreply@example.com"
   MAIL_DEFAULT_SUBJECT="Clean Nest"
   ```

4. **Start Docker services**

   ```bash
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL 17 on port `5432`
   - Redis 8 on port `6379`

5. **Run database migrations**

   ```bash
   make db-migrate-dev
   ```

6. **Start the development server**

   ```bash
   make dev
   ```

7. **Access the application**
   - API: http://localhost:8001
   - API Documentation: http://localhost:8001/docs

---

## Makefile Commands

Run `make help` to see all available commands:

| Command                  | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `make help`              | Display available commands                        |
| `make dev`               | Start the development server                      |
| `make start`             | Start the project                                 |
| `make typecheck`         | Run type checks                                   |
| `make build`             | Build the project                                 |
| `make lint`              | Lint the project                                  |
| `make format`            | Format the project                                |
| `make test`              | Run tests                                         |
| `make test-watch`        | Run tests in watch mode                           |
| `make db-generate`       | Generate migration SQL from the schema            |
| `make db-check`          | Check the migration folder for collisions         |
| `make db-migrate`        | Run database migrations (prod)                    |
| `make db-migrate-dev`    | Run database migrations (dev) — generate + migrate |
| `make db-push`           | Push the schema straight to the database (dev only) |
| `make db-studio`         | Start drizzle-kit Studio                          |
| `make deploy-prep`       | Prepare for deployment (install, migrate, build)  |
| `make deploy-dev`        | Deploy and start/reload the `dev` PM2 app         |
| `make deploy-staging`    | Deploy and start/reload the `staging` PM2 app     |
| `make deploy-production` | Deploy and start/reload the `production` PM2 app  |
| `make pm2-status`        | List PM2 processes                                |
| `make pm2-logs-<env>`    | Tail logs for `dev`, `staging`, or `production`   |
| `make pm2-stop-<env>`    | Stop `dev`, `staging`, or `production`            |

---

## Scripts

| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `bun run start:dev`  | Start in development mode (watch)     |
| `bun run start:prod` | Start in production mode              |
| `bun run build`      | Build for production                  |
| `bun run lint`       | Lint and fix code                     |
| `bun run format`     | Format code with Prettier             |
| `bun run typecheck`  | Run TypeScript type checks            |
| `bun run test`       | Run unit tests                        |
| `bun run test:e2e`   | Run end-to-end tests                  |
| `bun run test:cov`   | Run tests with coverage               |

---

## Docker Services

The `docker-compose.yml` includes:

| Service      | Image         | Port  | Description                    |
| ------------ | ------------- | ----- | ------------------------------ |
| **postgres** | postgres:17   | 5432  | PostgreSQL database            |
| **redis**    | redis:8       | 6379  | Redis cache & queue backend    |

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

---

## API Documentation

Once the application is running, access the interactive API documentation at:

- **Scalar UI**: http://localhost:8001/docs

The documentation includes all available endpoints, request/response schemas, and authentication setup.

`/docs` is mounted only when `API_DOCS_ENABLED=true`. The variable defaults to `false`, so a
deployment that does not set it serves no documentation route at all.

---

## Database Management

This project uses Drizzle ORM with Drizzle Kit for migrations.

```bash
# Generate migration SQL after editing libs/repositories/src/schema/
bunx --bun drizzle-kit generate

# Apply pending migrations
bunx --bun drizzle-kit migrate

# Check the migration folder for collisions
bunx --bun drizzle-kit check

# Push the schema straight to the database, skipping migration files (dev only)
bunx --bun drizzle-kit push

# Open Drizzle Studio
make db-studio
```

The schema lives in `libs/repositories/src/schema/` and generated migrations land in
`libs/repositories/src/migrations/` (both configured in `drizzle.config.ts`). After editing the
schema, run `make db-migrate-dev` to generate and apply the migration in one step.

---

## Testing

```bash
# Unit tests
bun run test

# Watch mode
bun run test:watch

# Coverage
bun run test:cov

# E2E tests
bun run test:e2e
```

---

## Deployment

Deployments are managed with [PM2](https://pm2.keymetrics.io/) using `ecosystem.config.js`, which
defines one app per environment:

| App name                           | Mode             | NODE_ENV     | Memory restart |
| ---------------------------------- | ---------------- | ------------ | -------------- |
| `clean-nest-drizzle-pg-dev`        | fork, 1 instance | `dev`        | 2G             |
| `clean-nest-drizzle-pg-staging`    | fork, 1 instance | `staging`    | 2G             |
| `clean-nest-drizzle-pg-production` | cluster, `max`   | `production` | 4G             |

Deploy with a single command per environment:

```bash
make deploy-dev
make deploy-staging
make deploy-production
```

Each target runs the full sequence — `bun install --frozen-lockfile`, `drizzle-kit migrate`,
`bun run build` — then **reloads** the PM2 app if it is already running (zero-downtime in cluster
mode) or starts it from the ecosystem file if not, and finally `pm2 save`.

Managing running processes:

```bash
make pm2-status            # pm2 list
make pm2-logs-dev          # also pm2-logs-staging / pm2-logs-production
make pm2-stop-dev          # also pm2-stop-staging / pm2-stop-production
```

**Notes**

- `pm2` must be on your `PATH`. If it is not installed globally, pass it in:
  `make deploy-dev PM2='bunx pm2'`.
- Per-environment configuration comes from the `.env` file in the deploy directory
  (`env_file: ".env"`). The ecosystem file sets only `NODE_ENV`.
- Adding a new environment means adding it to **both** `ecosystem.config.js` and the `NODE_ENV`
  choices in `libs/config/src/env/index.ts` — envalid rejects an unknown value and the process exits
  at boot.
- Logs are written to `logs/<env>-out.log` and `logs/<env>-error.log`. The directory is created by
  the deploy target and is gitignored.
- To rename the apps, change `PM2_APP_PREFIX` in the `Makefile` and the `name` fields in
  `ecosystem.config.js` together.
- Cluster mode is safe because nothing here runs on a timer. If you add scheduled work, it will run
  once per instance unless you guard it with a lock.

Without PM2, `make deploy-prep` still performs the install, migrate, and build steps, and
`bun run start:prod` starts the built bundle directly.

---

## Environment Variables

| Variable                 | Description                        | Default                      |
| ------------------------ | ---------------------------------- | ---------------------------- |
| `APP_NAME`               | Application name                   | `clean nest`                 |
| `APP_VERSION`            | Application version                | `1.0.0`                      |
| `APP_SECRET`             | Application secret key             | -                            |
| `APP_PORT`               | Server port                        | `8002`                       |
| `APP_URL`                | Application URL                    | `localhost:8002`             |
| `APP_TIMEZONE`           | Application timezone               | `UTC`                        |
| `NODE_ENV`               | `development` \| `dev` \| `staging` \| `production` \| `test` | `development` |
| `API_DOCS_ENABLED`       | Mount the Scalar API reference at `/docs` | `false`         |
| `FRONTEND_URL`           | Frontend application URL           | `http://localhost:3000`      |
| `DATABASE_URL`           | PostgreSQL connection string       | -                            |
| `JWT_SECRET`             | JWT signing secret                 | -                            |
| `JWT_REFRESH_SECRET`     | Refresh token secret               | -                            |
| `JWT_EXPIRES_IN`         | Access token expiry                | `1d`                         |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry               | `7d`                         |
| `THROTTLER_TTL`          | Rate limit window (seconds)        | `60`                         |
| `THROTTLER_LIMIT`        | Max requests per window            | `60`                         |
| `ALLOWED_ORIGINS`        | Comma-separated allowed CORS origins | `*`                        |
| `ALLOWED_METHODS`        | Comma-separated allowed HTTP methods | `GET,POST,PUT,PATCH,DELETE,OPTIONS` |
| `ALLOWED_HEADERS`        | Comma-separated allowed headers    | `Content-Type,Authorization` |
| `MAX_AGE`                | CORS preflight cache duration (s)  | `3600`                       |
| `CREDENTIALS`            | Allow credentials in CORS          | `false`                      |
| `REDIS_HOST`             | Redis host                         | `localhost`                  |
| `REDIS_PORT`             | Redis port                         | `6379`                       |
| `REDIS_PASSWORD`         | Redis password                     | -                            |
| `REDIS_TTL`              | Cache TTL in seconds               | `3600`                       |
| `MAIL_HOST`              | SMTP host                          | -                            |
| `MAIL_PORT`              | SMTP port                          | -                            |
| `MAIL_SECURE`            | Use TLS for SMTP                   | `false`                      |
| `MAIL_USERNAME`          | SMTP username                      | -                            |
| `MAIL_PASSWORD`          | SMTP password                      | -                            |
| `MAIL_FROM`              | Default sender email               | -                            |
| `MAIL_DEFAULT_SUBJECT`   | Default email subject              | `Clean Nest`                 |

All environment variables are validated by envalid in `libs/config/src/env/index.ts` and read through
`getEnv()`. Never read `process.env` directly — a variable that is not declared there is not
available to the app, and a missing or invalid required variable exits the process at boot rather
than failing later.

The `dev` and `staging` values of `NODE_ENV` exist for the deployed PM2 apps (see
[Deployment](#deployment)).

`API_DOCS_ENABLED` is the single switch for the `/docs` API reference and is independent of
`NODE_ENV` — set it to `true` on any environment where the schema should be browsable, and leave it
unset or `false` everywhere else. It defaults to `false` so an environment that never sets it cannot
expose the schema by accident; `.env.example` turns it on for local development.

---

### Porting configuration between the sibling templates

This template has three siblings — `clean-nest-drizzle-pg`, `clean-nest-prisma-pg`, `clean-elysia`,
and `clean-elysia-prisma` — and the two families use **different names for the same concepts**. The
names are internally consistent within each family and are deliberately left alone; this table exists
so an `.env` can be carried across without silently losing a setting.

**14 variables are common to all four**: `APP_NAME`, `APP_PORT`, `APP_TIMEZONE`, `APP_URL`,
`DATABASE_URL`, `JWT_SECRET`, `MAIL_FROM`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `NODE_ENV`,
`REDIS_HOST`, `REDIS_PASSWORD`, `REDIS_PORT`.

| Concern | NestJS family | Elysia family |
| ------- | ------------- | ------------- |
| App secret | `APP_SECRET` | `APP_KEY` |
| CORS origin | `ALLOWED_ORIGINS`, `ALLOWED_METHODS`, `ALLOWED_HEADERS`, `MAX_AGE`, `CREDENTIALS` | `ALLOWED_HOST` |
| Front-end URL | `FRONTEND_URL` | `CLIENT_URL` |
| Mail credentials | `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_DEFAULT_SUBJECT` | `MAIL_USER`, `MAIL_PASS` |
| Redis extra | `REDIS_TTL` | `REDIS_DB` |
| JWT | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | `JWT_SECRET` only |

**NestJS-only** (no Elysia equivalent): `API_DOCS_ENABLED`, `THROTTLER_TTL`, `THROTTLER_LIMIT`,
`APP_VERSION`.

**Elysia-only**: `APP_CLUSTER_MODE`, `APP_CLUSTER_WORKERS`, `LOG_LEVEL`, `CLICKHOUSE_HOST`,
`CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`, and `APP_REUSE_PORT`
(`clean-elysia` only).

Two behaviours do **not** port, because the Elysia family has no equivalent variable:

- `API_DOCS_ENABLED` gates the docs UI here on an explicit flag defaulting to `false`, so an
  environment that never sets it cannot expose the schema. The Elysia family gates `/docs` on
  `APP_ENV !== "production"` instead, publishing it on any non-production deployment.
- `THROTTLER_TTL` / `THROTTLER_LIMIT` drive the throttler from the environment here. The Elysia rate
  limit is hardcoded in its security plugin.

## Conventions and AI Agent Rules

Architecture notes and coding standards live alongside the code so both humans and AI coding agents
work from the same source of truth:

- **`CLAUDE.md`** — project overview, commands, architecture, and the non-obvious behaviours worth
  knowing before making a change.
- **`.claude/rules/`** — path-scoped standards applied per file type: `controller.md`, `service.md`,
  `repository.md`, `dto.md`, `module.md`, `schema.md`, `i18n.md`, `response-codes.md`, `routes.md`,
  `rate-limiting.md`, `clean-code.md`, `shared-code.md`, and more. Two apply to every change:
  `contradiction-halt.md` (report contradictions instead of silently implementing them) and
  `documentation.md` (a doc your change makes wrong is fixed in the same change).
- **`.claude/commands/`** — `/commit` (Conventional Commit workflow), `/update-todo`, and
  `/audit-flow` (read-only whole-codebase audit that writes explained findings to
  `docs/audit-findings.md` and never modifies code).
- **`.claude/skills/`** — a symlink to `.agents/skills/`, the general engineering skill bundle
  managed through `skills-lock.json`. See that directory's `README.md` for the installed set.

Core conventions at a glance:

- Request flow is **Controller → Service → Repository**. Controllers handle HTTP only, services own
  business logic and transactions, repositories run Drizzle queries.
- Repositories are **factory functions**, not classes: `UserRepository().findByEmail(email)`. Each
  method takes an optional trailing `tx?: DbTransaction` to join a service-owned transaction.
- Transactions live in the service: `await db.transaction(async (tx) => { ... })`.
- Responses go through `ResponseHandler` and are sent via `res.status(code).send(...)`.
- Permission strings are `entity:action` with a singular entity (`user:create`).
- Use `PATCH`, not `PUT`, for updates.
- Every user-facing string resolves through i18n, with the key present in both `en` and `id`.
- Uniqueness and business-rule failures are **422**, not 409, keyed `error` (singular).
- Style is tabs, double quotes, semicolons; no `any` except `catch (err: unknown)`.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License
Copyright (c) 2025 Aolus Software
```
