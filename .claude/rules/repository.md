---
paths:
  - "libs/repositories/src/repositories/**/*.ts"
---

# Repository Rules

## Pattern

Repositories are plain **factory functions** — not injectable NestJS classes, and they take **no constructor arguments**. Each file exports one factory that closes over the module-level `db` singleton from `@repositories` and returns an object of query/mutation methods.

```ts
import { db } from "@repositories";
import { DbTransaction } from ".";

export const UserRepository = () => {
	const dbInstance = db;

	return {
		db: dbInstance,
		getDb: (tx?: DbTransaction) => tx || dbInstance,

		findByEmail: async (email: string, tx?: DbTransaction): Promise<UserForAuth> => {
			const database = tx || dbInstance;
			// ...
		},
	};
};
```

- Call as `UserRepository().findByEmail(email)` — never `new`, never inject.
- Every method that touches the DB takes an **optional trailing `tx?: DbTransaction`** and resolves `const database = tx || dbInstance;` on its first line. This lets a service run the method inside a transaction.
- `DbTransaction` is exported from `libs/repositories/src/repositories/index.ts` — import it from `.` or `@repositories`.

## Transactions

Repositories must **never** open their own transaction (`db.transaction(...)`). Transaction management belongs to the service layer (see `service.md`). The repository only *accepts* a `tx` and uses it via `const database = tx || dbInstance;`.

## Types

- Define every exported type (`UserList`, `UserDetail`, `UserCreate`, `UserInformation`, etc.) in the same file, above the factory function. Mutation inputs are explicit named types (`UserCreate`), not the DTO.
- No `any` — ever. Use Drizzle's typed helpers and `SQL` from `drizzle-orm`.
- Build `where` clauses as `SQL | undefined` and compose with `and(...)`, `or(...)`, `eq(...)`, `ilike(...)`, `isNull(...)` from `drizzle-orm`.

## Sort field allow-listing

Never order by a raw user-supplied string. Map allowed sort keys to columns and fall back to a safe default:

```ts
const validateOrderBy = {
	id: users_table.id,
	name: users_table.name,
	email: users_table.email,
	created_at: users_table.created_at,
};
type OrderableKey = keyof typeof validateOrderBy;
const normalizedOrderBy: OrderableKey = (
	Object.keys(validateOrderBy) as OrderableKey[]
).includes(orderBy as OrderableKey)
	? (orderBy as OrderableKey)
	: ("id" as OrderableKey);

const orderColumn = validateOrderBy[normalizedOrderBy];
orderBy: orderDirection === "asc" ? asc(orderColumn) : desc(orderColumn),
```

## findAll / pagination

`findAll(queryParam: DatatableType, tx?)` returns `Promise<PaginationResponse<XList>>`. Run the page query and the count in parallel, then return `{ data, meta }`:

```ts
const [data, totalCount] = await Promise.all([
	database.query.users.findMany({ where, orderBy, limit, offset, columns, with }),
	database.$count(users_table, where),
]);

return {
	data: formattedData,
	meta: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
};
```

Always apply the soft-delete filter `isNull(<table>.deleted_at)` to read queries on soft-deletable tables.

## Relational queries

Prefer Drizzle's relational query builder (`database.query.<table>.findMany / findFirst`) with explicit `columns` and `with` for joins, then map the raw rows into the flat exported type (`UserList` / `UserDetail`). Do not leak the nested relation shape out of the repository.

## Soft delete

"Delete" sets `deleted_at` to now — it does not issue a `DELETE`:

```ts
await database.update(users_table).set({ deleted_at: new Date() }).where(eq(users_table.id, userId));
```

## Comments

One block comment per method, above the function. No line-by-line comments.
