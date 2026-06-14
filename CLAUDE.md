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
bun run test -- src/settings/users/users.service.spec.ts   # single file

# Database (drizzle-kit)
make db-migrate-dev      # drizzle-kit generate + migrate (dev)
make db-migrate          # drizzle-kit migrate (prod)
bunx --bun drizzle-kit generate   # generate a migration from schema changes
bunx --bun drizzle-kit studio     # GUI (make db-studio)
```

After editing anything under `libs/repositories/src/schema/`, run `make db-migrate-dev` to regenerate and apply the migration.

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
- **Env access is centralized.** Never read `process.env` directly — call `getEnv()` from `@config` (envalid-validated, cached on first call). Swagger/Scalar docs at `/docs` are only mounted when `NODE_ENV !== "production"`.
- **Mail is queued.** `MailService.sendMail(...)` enqueues a BullMQ job (`mail-queue`) processed by `mail.processor.ts`; it auto-injects `appName` and `frontendUrl` into the Handlebars template context. Use `sendEmailSync` only when you must send inline.
- **Soft deletes.** User rows carry `deleted_at`; every query filters `isNull(users_table.deleted_at)` and "delete" sets the timestamp.

## Conventions

Detailed, path-scoped rules live in `.claude/rules/` and are the source of truth for writing code — consult the relevant one before adding a controller, service, repository, DTO, or module. Highlights:

- **Style:** tabs, double quotes, semicolons (Prettier). No `any` except `catch (err: unknown)`. Explicit return types and parameter types everywhere. One block comment above each function — never line-by-line comments. No emojis/icons. No `console.*` — use `LoggerUtils`.
- **Shared code** (guards, pipes, decorators, utils, types) belongs in `libs/`, never in `src/`.
- **One domain entity per module** (one controller + one service). See `.claude/rules/module.md`.
- **Permission strings** are `entity:action` with the entity singular: `user:create`, `user:list`, `user:view`, `user:update`, `user:delete`.

## Skills, rules, and commands

- `.claude/skills/` is a symlink to `.agents/skills/` (managed via `skills-lock.json`). It bundles general engineering skills (TDD, systematic debugging, writing plans, NestJS best practices, etc.).
- `.claude/rules/` — path-scoped coding standards for this codebase.
- `.claude/commands/` — `/commit` (conventional commit workflow) and `/update-todo`.
