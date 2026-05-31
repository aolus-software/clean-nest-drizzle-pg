---
paths:
  - "libs/**/*.ts"
---

# Shared Code Rules

Anything reusable across feature modules lives in `libs/`, never in `src/`. When changing shared code, consider every module that depends on it. Every new export must be added to the lib's `src/index.ts` or the path-alias import will not resolve.

## What belongs in `@common` (`libs/common/src`)

NestJS-aware shared building blocks:

| Category | Examples | Location |
|---|---|---|
| Guards | `AuthGuard`, `RoleGuard`, `PermissionGuard` | `guards/<name>/` |
| Passport strategies | `auth.strategy` | `strategies/` |
| Param/method decorators | `CurrentUser`, `RoleAuth`, `PermissionAuth`, `ApiStandardResponses`, `ApiSuccessResponse`, `DefaultApiNotFoundResponse`, `ApiDatatableQueries` | `decorators/<name>/` |
| Pipes | `CustomValidationPipe`, `FilterValidationPipe` | `pipes/<name>/` |
| Interceptors | file-upload | `interceptors/<name>/` |
| Response helpers | `ResponseHandler`, `successResponse` | `response/` |
| Cache / mail / throttler | `CacheService`, `MailService` + `MailModule`, throttler module | `cache/`, `mail/`, `throttler/` |
| Shared types | `DatatableType`, `PaginationResponse`, `SortDirection` | `types/` |

## What belongs in `@repositories` (`libs/repositories/src`)

The Drizzle data layer: the `db` singleton, `schema/` (tables + relations + enums), `migrations/`, and repository factory functions in `repositories/`. `DbTransaction` and all table objects (`users_table`, ...) are exported from here.

## What belongs in `@utils` (`libs/utils/src`)

Pure, stateless helpers with **no NestJS dependency**: `HashUtils` (bcryptjs), `JWTUtils`, `DateUtils` (dayjs), `EncryptionUtils` (crypto-js), `StrUtils`, `NumberUtils`, `LoggerUtils`, and constants (`defaultSort`, `paginationLength`, token lifetimes, upload limits).

## What belongs in `@config` (`libs/config/src`)

`getEnv()` (envalid validation, cached) and the app configs applied in `main.ts`: `CorsConfig`, `HelmetConfig`, `swaggerConfig`. Add new env vars to the `IEnvConfig` interface, the `cleanEnv` schema, and the returned object in `libs/config/src/env/index.ts`.
