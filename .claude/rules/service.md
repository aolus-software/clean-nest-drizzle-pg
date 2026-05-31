---
paths:
  - "src/**/*.service.ts"
---

# Service Rules

## Pattern

Services are `@Injectable()` NestJS classes. Inject collaborators (e.g. `MailService`, `CacheService`) via the constructor — never `new`. The database is **not** injected: import the `db` singleton and repository factories from `@repositories` directly.

```ts
@Injectable()
export class UsersService {
	constructor(private readonly mailService: MailService) {}
}
```

## Return types

Every method has an explicit return type. Write methods return `Promise<void>` unless a caller needs the entity back.

```ts
async findAll(query: DatatableType): Promise<PaginationResponse<UserList>> { ... }
async getDetail(id: string): Promise<UserDetail> { ... }
async create(dto: CreateUserDto): Promise<void> { ... }
async update(id: string, dto: UpdateUserDto): Promise<void> { ... }
async remove(id: string): Promise<void> { ... }
```

## Parameters and variables

Every parameter has an explicit type. Declare nullable/union variables with their type explicitly (`const user: UserDetail | null = ...`). `any` is forbidden outside `catch (err: unknown)`.

## Repository access

Call repository factories directly — `UserRepository()` takes no arguments and uses the global `db`:

```ts
const exists = await UserRepository().findByEmail(dto.email);
const data = await UserRepository().getDetail(id);
```

## Transactions

Transactions are the **service's** responsibility. Wrap multi-write logic in `db.transaction` and thread `tx` into each repository/Drizzle call:

```ts
await db.transaction(async (tx) => {
	const user = await tx.insert(users_table).values({ ... }).returning();
	await tx.insert(email_verifications_table).values({ user_id: user[0].id, ... });
	await this.mailService.sendMail({ ... });
});
```

Repository methods accept an optional trailing `tx` — pass it so they join the same transaction: `UserRepository().findAll(query, tx)`.

## Existence checks and errors

Fetch-then-act: verify the entity exists before update/delete and throw the right exception. All exceptions come from `@nestjs/common` — never throw raw `Error`.

| Scenario | Exception |
|---|---|
| Entity not found | `NotFoundException("User with ID ${id} not found")` |
| Field-level validation failure (e.g. duplicate email) | `UnprocessableEntityException({ message, error: { field: [...] } })` |

The `UnprocessableEntityException` payload shape matters — `ResponseHandler.handleError` unpacks `error: { field: ["msg"] }` into the 422 response. Use it for anything the client should see mapped to a form field.

## Comments

One block comment per method, above the signature. No line-by-line comments. No `console.*` — use `LoggerUtils` from `@utils`.
