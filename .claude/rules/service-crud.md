---
paths:
  - "src/**/*.service.ts"
---

# Service CRUD Rules

A full CRUD service implements these methods. List/detail delegate to the repository; create/update/delete own the validation, transformation, and transaction.

```ts
async findAll(query: DatatableType): Promise<PaginationResponse<XList>>
async getDetail(id: string): Promise<XDetail>
async create(dto: CreateXDto): Promise<void>
async update(id: string, dto: UpdateXDto): Promise<void>
async remove(id: string): Promise<void>
```

## findAll

Delegates entirely to the repository — no extra logic.

```ts
async findAll(query: DatatableType): Promise<PaginationResponse<UserList>> {
	return await UserRepository().findAll(query);
}
```

## getDetail

Fetch by ID; throw `NotFoundException` if missing. The exception message format is `"<Entity> with ID ${id} not found"`.

```ts
async getDetail(id: string): Promise<UserDetail> {
	const data = await UserRepository().getDetail(id);
	if (!data) {
		throw new NotFoundException(`User with ID ${id} not found`);
	}
	return data;
}
```

## create

Validate uniqueness first, hash/transform inputs, then write inside a transaction.

```ts
async create(dto: CreateUserDto): Promise<void> {
	const exists = await UserRepository().findByEmail(dto.email);
	if (exists) {
		throw new UnprocessableEntityException({
			message: "Email already exists",
			error: { email: ["Email already exists"] },
		});
	}

	const password = await HashUtils.generateHash(dto.password);
	await db.transaction(async (tx) => {
		const user = await tx.insert(users_table).values({ ...dto, password }).returning();
		// related writes use the same tx
	});
}
```

- Uniqueness/business-validation errors use `UnprocessableEntityException` with the `error: { field: [...] }` shape.
- Hash passwords and compute derived fields in the service before writing.

## update

Verify existence, re-check uniqueness only for changed fields, then write in a transaction.

```ts
async update(id: string, dto: UpdateUserDto): Promise<void> {
	const data = await UserRepository().getDetail(id);
	if (!data) {
		throw new NotFoundException(`User with ID ${id} not found`);
	}

	const emailOwner = await UserRepository().findByEmail(dto.email);
	if (emailOwner && emailOwner.id !== id) {
		throw new UnprocessableEntityException({
			message: "Email already exists",
			error: { email: ["Email already exists"] },
		});
	}

	await db.transaction(async (tx) => {
		await tx.update(users_table).set({ ... }).where(eq(users_table.id, id));
	});
}
```

## remove

Verify existence, then soft-delete (set `deleted_at`) — do not issue a hard `DELETE`.

```ts
async remove(id: string): Promise<void> {
	const data = await UserRepository().getDetail(id);
	if (!data) {
		throw new NotFoundException(`User with ID ${id} not found`);
	}
	await db.transaction(async (tx) => {
		await tx.update(users_table).set({ deleted_at: DateUtils.now().toDate() }).where(eq(users_table.id, id));
	});
}
```

## Imports

```ts
import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DatatableType, PaginationResponse } from "@common";
import { db, UserRepository, UserDetail, UserList, users_table } from "@repositories";
import { HashUtils, DateUtils } from "@utils";
import { eq } from "drizzle-orm";
```

Import only the exceptions the service actually throws.
