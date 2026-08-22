# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`clean-nest-drizzle-pg` — a Clean Architecture NestJS boilerplate on the **Fastify** adapter, **Drizzle ORM** + **PostgreSQL**, Redis cache, BullMQ queues, and JWT (Passport) auth. Runtime is **Bun** (Node also works). Ships an auth flow and a settings domain (users, roles, permissions) with RBAC.

## Commands

Use **Bun** as the package manager and runner. The `Makefile` is the canonical entry point.

```bash
# Development
make dev                 # bun run start:dev (watch)
bun run start:debug      # debugger
make build               # bun run build (webpack bundle)
bun run start:prod       # node dist/main

# Quality
make lint                # eslint --fix on {src,apps,libs}/**/*.ts
make format              # prettier --write

# Tests
make test                # jest (unit, *.spec.ts)
make test-watch
bun run test:cov
bun run test:e2e         # jest --config ./test/jest-e2e.json
bun run test -- <path/to/file.spec.ts>   # single file (the repo ships no specs yet)

# Database (drizzle-kit)
make db-migrate-dev      # drizzle-kit generate + migrate (dev)
make db-migrate          # drizzle-kit migrate (prod)
make db-generate         # drizzle-kit generate (migration SQL from schema changes)
make db-check            # drizzle-kit check (migration folder collisions)
make db-push             # drizzle-kit push (skip migration files; dev only)
make db-seed             # bun run seed (permissions, roles, baseline users)
bunx --bun drizzle-kit studio     # GUI (make db-studio)

# Deployment (PM2)
make deploy-dev          # install + migrate + build, then start/reload pm2 app
make deploy-staging
make deploy-production
make pm2-status          # pm2 list
make pm2-logs-dev        # also pm2-logs-staging / pm2-logs-production
make pm2-stop-dev        # also pm2-stop-staging / pm2-stop-production
```

Deploys are driven by `ecosystem.config.js`, which defines one PM2 app per environment named `clean-nest-drizzle-pg-<env>` (`PM2_APP_PREFIX` in the `Makefile` must match). Each `deploy-<env>` target runs the full prep sequence, then **reloads** the app if it already exists (zero-downtime under cluster mode) or starts it from the ecosystem file if not. `pm2` must be on `PATH`; override with `make deploy-dev PM2='bunx pm2'`. Production runs `instances: "max"` in cluster mode, dev and staging run a single fork.

`NODE_ENV` is set per app to `dev` / `staging` / `production` — all three are in the envalid `choices` list. Adding an environment means adding it to **both** `ecosystem.config.js` and `getEnv()`, or the process exits at boot. The `/docs` UI is gated by `API_DOCS_ENABLED`, not by `NODE_ENV`.

After editing anything under `libs/repositories/src/schema/`, run `make db-migrate-dev` to regenerate and apply the migration.

Seed data lives in `libs/repositories/src/seed/` — beside the schema and migrations it depends on — and runs via `make db-seed`. It is re-runnable: every insert relies on a unique or composite primary key and conflicts are ignored, and existing users are skipped rather than rewritten. It seeds the `entity:action` permission catalogue that `@PermissionAuth` strings are checked against — a guard naming a permission the seeder does not produce fails **closed**, so add the permission there in the same change as the route. The seed files are the one place in `libs/` that loads `dotenv` and calls `process.exit`, because they are an entry point rather than library code; they are deliberately **not** exported from `@repositories`.

## Architecture

NestJS monorepo: feature modules in `src/`, four path-aliased shared libraries in `libs/` (declared as Nest library projects in `nest-cli.json`).

| Alias | Path | Purpose |
|---|---|---|
| `@common` | `libs/common/src` | Guards, pipes, decorators, interceptors, Passport strategy, mail, cache, throttler, `ResponseHandler`, shared types (`DatatableType`, `PaginationResponse`, `SortDirection`) |
| `@repositories` | `libs/repositories/src` | Drizzle `db` instance, schema (tables + relations), migrations, and repository factory functions |
| `@utils` | `libs/utils/src` | Pure stateless helpers: `HashUtils`, `JWTUtils`, `DateUtils`, `StrUtils`, `NumberUtils`, `EncryptionUtils`, `LoggerUtils`, and constants (`defaultSort`, `paginationLength`, token lifetimes, upload limits) |
| `@config` | `libs/config/src` | `getEnv()` validated env, plus `CorsConfig` / `HelmetConfig` / `swaggerConfig` applied in `main.ts` |

Every public export of a lib is re-exported from its `src/index.ts` — add new exports there or the alias import will not resolve.

### Request flow

`Controller` (HTTP only) → `Service` (business logic, transactions) → `Repository` (Drizzle queries). Controllers never touch the DB; repositories never open transactions.

### The non-obvious bits

- **`db` is a module-level singleton, not DI.** It is constructed in `libs/repositories/src/index.ts` from `getEnv().DATABASE_URL` and exported. Repositories and services import `db` directly — there is no `PrismaService`-style provider, so a feature module does **not** need to import a "RepositoriesModule" to query the DB. Import only what you actually inject (e.g. `MailModule` for `MailService`).
- **Repositories are factory functions, not classes.** `export const UserRepository = () => ({ ...methods })`. Call as `UserRepository().findByEmail(email)`. Each method takes an optional trailing `tx?: DbTransaction`; pass it to run inside a service-owned transaction. `getDb(tx?)` resolves to `tx ?? db`.
- **Transactions live in the service.** Wrap multi-write logic in `await db.transaction(async (tx) => { ... })` and thread `tx` into repository calls. `DbTransaction` is exported from `@repositories`.
- **Responses go through `ResponseHandler` and the Fastify reply.** Controllers send the happy path with `return res.status(status).send(ResponseHandler.success(status, message, data))` (the `res.status(...)` code must match the `ResponseHandler.success(...)` code — 201 for create, 200 otherwise) and call `ResponseHandler.handleError(res, error)` inside `catch`. Never return the bare `ResponseHandler.success(...)` object. `handleError` special-cases `UnprocessableEntityException` to surface its `{ message, error: { field: [...] } }` payload as a 422 — this is the convention for field-level validation errors.
- **Auth/RBAC is decorator-driven.** Apply `@UseGuards(AuthGuard, PermissionGuard, RoleGuard)` at the controller class, then gate each method with `@PermissionAuth("user:create")` or `@RoleAuth("superuser")`. `@CurrentUser()` injects the resolved `UserInformation` (roles + flattened permissions), cached in Redis.
- **Env access is centralized.** Never read `process.env` directly — call `getEnv()` from `@config` (envalid-validated, cached on first call). Swagger/Scalar docs at `/docs` are mounted only when `API_DOCS_ENABLED` is true — a single switch, independent of `NODE_ENV`, defaulting to `false` so an unset environment cannot expose the schema. Add a new var to the `IEnvConfig` interface, the `cleanEnv` schema, and the returned object in `libs/config/src/env/index.ts`, then to `.env.example` and the README table.
- **Mail is queued.** `MailService.sendMail(...)` enqueues a BullMQ job (`mail-queue`) processed by `mail.processor.ts`; it auto-injects `appName` and `frontendUrl` into the Handlebars template context. Use `sendEmailSync` only when you must send inline.
- **Soft deletes.** User rows carry `deleted_at`; every query filters `isNull(users_table.deleted_at)` and "delete" sets the timestamp.

## Conventions

Detailed, path-scoped rules live in `.claude/rules/` and are the source of truth for writing code — consult the relevant one before adding a controller, service, repository, DTO, or module.

Two of them apply to **every** change regardless of path: `contradiction-halt.md` (a request that contradicts a rule, the architecture, or a security invariant is reported and halted, never silently implemented or silently worked around) and `documentation.md` (a doc your change makes wrong is fixed in the same change). Read those two before starting, not after.

Highlights:

- **Style:** tabs, double quotes, semicolons (Prettier). No `any` except `catch (err: unknown)`. Explicit return types and parameter types everywhere. One block comment above each function — never line-by-line comments. No emojis/icons. No `console.*` — use `LoggerUtils`.
- **Shared code** (guards, pipes, decorators, utils, types) belongs in `libs/`, never in `src/`.
- **One domain entity per module** (one controller + one service). See `.claude/rules/module.md`.
- **Permission strings** are `entity:action` with the entity singular: `user:create`, `user:list`, `user:view`, `user:update`, `user:delete`.
- **Use `PATCH` (not `PUT`)** for updates.
- **No hardcoded user-facing strings** — every response message, exception message, and validation message resolves through i18n, with the key added to both `en` and `id` before the code that uses it. See `.claude/rules/i18n.md`.
- **Uniqueness and business-rule failures are 422**, not 409, and the field map is keyed `error` (singular): `{ message, error: { field: [...] } }`. See `.claude/rules/response-codes.md`.
- **Rate limiting is global and always on** — `ThrottlerGuard` is an `APP_GUARD`, so every route can return 429. Never re-register it per module. See `.claude/rules/rate-limiting.md`.
- **Routes are flat** — no `setGlobalPrefix`, no versioning; access is enforced by guards and `@PermissionAuth`/`@RoleAuth`, never by the path prefix. The live route map is `.claude/rules/routes.md`, updated in the same change as the route.

## Skills, rules, and commands

- `.claude/skills/` is a symlink to `.agents/skills/` (managed via `skills-lock.json`). It bundles general engineering skills — workflow (TDD, systematic debugging, writing/executing plans, code review, handoff) and craft (NestJS best practices, clean code, advanced TypeScript, PostgreSQL). See that directory's `README.md` for the full set and how to add one.
- `.claude/rules/` — path-scoped coding standards for this codebase. [`.claude/rules/README.md`](.claude/rules/README.md) indexes all 20 with their scope; `contradiction-halt.md` and `documentation.md` apply to every change.
- `.claude/commands/` — `/commit` (conventional commit workflow), `/update-todo`, and `/audit-flow` (read-only whole-codebase sweep that writes explained findings to `docs/audit-findings.md` and never fixes anything; its writing contract is `.claude/rules/audit-findings.md`).
