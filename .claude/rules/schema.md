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

## Indexes

- `.unique()` already creates a unique index; never add a plain `index()` on the same column.
- A composite primary key only serves lookups by its leading column. `user_roles` and
  `role_permissions` carry `user_roles_role_id_index` and `role_permissions_permission_id_index` for
  "who holds this role", "which roles grant this permission", and the `ON DELETE CASCADE` from
  `roles` / `permissions`.
- `users_created_at_live_index` is a partial index on `created_at WHERE deleted_at IS NULL`, the
  default user list order (`defaultSort`). Change it with the default sort.
- The token tables index `(user_id, used_at)` for the `user_id` foreign key and per-user token lookups.

## Relations

Declare a `<entity>_relations` export with `relations(...)` next to each table for the relational query API (`db.query.<table>.findMany({ with: ... })`).

## Registration

After adding a table or relation, register **both** in the `schema` object in `libs/repositories/src/schema/index.ts` (tables keyed by their relational-query name, e.g. `users: users_table`, and the `*_relations` exports). The `db` instance is typed from this object — an unregistered table is invisible to `db.query.*`.

## Migrations

Schema is the source of truth. After any change run `make db-migrate-dev` (drizzle-kit generate + migrate). Never hand-edit generated migration files under `libs/repositories/src/migrations/`.

## Seeding

Seed data lives in `libs/repositories/src/seed/` and runs via `make db-seed` (`bun run seed`). It is the only code under `libs/` that is an entry point rather than library code, which is why it loads `dotenv`, calls `process.exit`, and is not exported from the `@repositories` barrel.

Every seeder must stay **re-runnable**: insert against a unique or composite primary key and add `.onConflictDoNothing()`, or check for the row first. Never write a seeder that updates an existing row — `user.seed.ts` skips accounts that already exist so a re-run cannot overwrite a password an operator has changed.

`permission.seed.ts` is the ground truth for the `entity:action` strings `@PermissionAuth` resolves against. A guard naming a permission it does not produce fails **closed**, so add the permission there in the same change as the route.
