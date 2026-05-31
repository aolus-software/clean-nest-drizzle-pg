---
paths:
  - "libs/repositories/src/schema/**/*.ts"
---

# Drizzle Schema Rules

## File and naming conventions

- One file per domain area: `<entity>.schema.ts`. Related join tables can share a file (e.g. RBAC tables in `rbac.schema.ts`).
- Table exports are `snake_case` with a `_table` suffix: `users_table`, `user_roles_table`.
- Column names are `snake_case` (`created_at`, `email_verified_at`, `deleted_at`).
- Define `pgEnum` once per enum and export a matching TS union type plus an array for reuse:

```ts
export type UserStatusEnum = "active" | "inactive" | "suspended" | "blocked";
export const UserStatusEnumArray: Array<UserStatusEnum> = ["active", "inactive", "suspended", "blocked"];
export const user_status_enum = pgEnum("user_status", ["active", "inactive", "suspended", "blocked"]);
```

## Standard columns

- Primary key: `id: uuid().primaryKey().defaultRandom()`.
- Timestamps: `created_at: timestamp().defaultNow()` and `updated_at: timestamp().defaultNow().$onUpdate(() => new Date())`.
- Soft delete: include `deleted_at: timestamp()` on entities that are soft-deleted, and add a composite index covering the columns queried together (e.g. `email`, `deleted_at`, `status`).

## Relations

Declare a `<entity>_relations` export with `relations(...)` next to each table for the relational query API (`db.query.<table>.findMany({ with: ... })`).

## Registration

After adding a table or relation, register **both** in the `schema` object in `libs/repositories/src/schema/index.ts` (tables keyed by their relational-query name, e.g. `users: users_table`, and the `*_relations` exports). The `db` instance is typed from this object — an unregistered table is invisible to `db.query.*`.

## Migrations

Schema is the source of truth. After any change run `make db-migrate-dev` (drizzle-kit generate + migrate). Never hand-edit generated migration files under `libs/repositories/src/migrations/`.
