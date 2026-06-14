---
paths:
  - "src/**/*.controller.ts"
---

# Controller Rules

## Responsibility

Controllers handle HTTP only: validate input via DTOs, call exactly one service method, return the response. No conditionals, data transformation, or DB access in a controller method.

## ApiTags

Every controller class has `@ApiTags("...")`. This project uses flat, slash-grouped tag names that mirror the route, e.g. `@ApiTags("Settings/Users")` for `@Controller("users")` under the settings domain.

## Response shape

Always send the response through the injected Fastify reply: `return res.status(<code>).send(ResponseHandler.success(...))`. Route every error through `ResponseHandler.handleError(res, error)`. Inject the reply with `@Res() res: FastifyReply` (required for both `.send()` and `handleError`).

```ts
@Post()
@PermissionAuth("user:create")
@ApiStandardResponses()
async create(@Body() dto: CreateUserDto, @Res() res: FastifyReply) {
	try {
		await this.usersService.create(dto);
		return res
			.status(201)
			.send(ResponseHandler.success<void>(201, "User created successfully", undefined));
	} catch (error) {
		return ResponseHandler.handleError(res, error);
	}
}
```

- Always call `res.status(<code>).send(...)` on the success path — never return the bare `ResponseHandler.success(...)` object. The HTTP status passed to `res.status(...)` must match the `code` argument of `ResponseHandler.success(...)` (201 for create, 200 otherwise).
- Pass an explicit type param to `ResponseHandler.success<T>` (`<void>` when there is no body data, with `undefined` as the data argument).
- Never let an exception propagate uncaught from a controller method — always wrap in try/catch and delegate to `handleError`.
- Build the envelope with `ResponseHandler.success(...)`; do not hand-build raw response objects.

## Swagger decorators

Document every endpoint:

- `@ApiStandardResponses()` — standard 4xx/5xx envelope. Pass `{ validation: false }` on read-only endpoints that cannot return a 422, etc.
- `@ApiSuccessResponse(status, "message", example)` — typed success body (the example must match the real shape; for list endpoints include `data` and `meta`).
- `@DefaultApiNotFoundResponse("Entity")` — on detail/update/delete endpoints that can 404.
- `@ApiDatatableQueries()` — on list endpoints, documents page/limit/search/sort/filter.
- `@ApiBearerAuth("Bearer")` — at the class level for authenticated controllers.

All of these import from `@common` (except `@ApiTags` / `@ApiBearerAuth` from `@nestjs/swagger`).

## Guards and authorization

Apply guards once at the class level when all endpoints share auth, then gate individual methods with permission/role decorators:

```ts
@Controller("users")
@UseGuards(AuthGuard, PermissionGuard, RoleGuard)
@ApiTags("Settings/Users")
@ApiBearerAuth("Bearer")
export class UsersController { ... }
```

- `@PermissionAuth("user:create")` — permission gate (`entity:action`, entity singular).
- `@RoleAuth("superuser")` — role gate.
- `@CurrentUser()` — inject the authenticated `UserInformation`.
