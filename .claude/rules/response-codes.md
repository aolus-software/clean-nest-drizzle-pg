---
paths:
  - "src/**/*.controller.ts"
---

# Response Codes Rules

## Overview

Success payloads are built with `ResponseHandler.success(...)` and sent through the Fastify reply
(see `controller.md`); errors go through `ResponseHandler.handleError(res, error)`. Swagger error
responses are declared with `@ApiStandardResponses(...)` and the success body with
`@ApiSuccessResponse(...)` / `@DefaultApiNotFoundResponse(...)`. All three live in
`libs/common/src/decorators/api-response/api-response.decorator.ts` and are re-exported from
`@common`.

## `@ApiStandardResponses` — the real option set

The decorator accepts **exactly these seven flags**, all defaulting to `true`:

| Flag | Status | Swagger response |
|---|---|---|
| `badRequest` | 400 | Bad Request |
| `unauthorized` | 401 | Unauthorized |
| `forbidden` | 403 | Forbidden |
| `validation` | 422 | Validation error (field payload) |
| `toManyRequests` | 429 | Too Many Requests |
| `internalServerError` | 500 | Internal Server Error |
| `serviceUnavailable` | 503 | Service Unavailable |

> **The 429 flag is spelled `toManyRequests`, with one `o`.** That is the actual property name in
> `ApiStandardResponsesOptions`. Passing the correctly-spelled `tooManyRequests` is silently ignored
> (it is not in the interface), leaving the flag at its `true` default — which happens to be
> harmless, but means an attempt to *disable* 429 documentation silently fails. Match the existing
> spelling until it is renamed deliberately across every call site.

There is **no `conflict` (409) flag** — do not pass one, it is silently ignored. 404 is **not** part
of this decorator; document it separately with `@DefaultApiNotFoundResponse("Entity")`. Pass a flag
as `false` only when the endpoint genuinely cannot produce that status.

## How runtime status is actually produced

`ResponseHandler.handleError` (`libs/common/src/response/response.ts:37`):

- `UnprocessableEntityException` → **422**, spreading its payload onto the standard envelope
  verbatim (`{ ...ErrorResponse, ...error.getResponse() }`). This is the field-validation contract.
- any other `HttpException` → echoes `error.getStatus()`, taking the message from `message`, then
  `error`, then `message.common.error`.
- anything else → logged via `LoggerUtils.error` and returned as a generic **500**.

Because the 422 branch spreads the payload verbatim, **the key name in the thrown payload is the key
name the client receives.** A misnamed key ships a map nothing reads.

### The 422 field map is keyed `error`, never `errors`

`@ApiStandardResponses` documents the 422 body as:

```json
{ "code": 422, "success": false, "message": "…", "data": null,
  "error": { "field1": ["…"], "field2": ["…"] } }
```

Every producer of a 422 must match that key. A service throwing a uniqueness or business-rule
failure by hand uses `error` (see `service-crud.md`), and every hand-thrown 422 in `src/` already
does:

```ts
throw new UnprocessableEntityException({
	message: this.i18n.t("message.user.email_exists"),
	error: { email: [this.i18n.t("message.user.email_exists")] },
});
```

> **Known divergence — do not copy it.** `CustomValidationPipe`'s `exceptionFactory`
> (`libs/common/src/pipes/custom-validation/custom-validation.pipe.ts`) currently emits
> `errors: formattedErrors` (plural). Since `handleError` spreads verbatim, a DTO-level validation
> failure reaches the client under `errors` while Swagger and every hand-thrown 422 say `error`, so a
> consumer parsing the documented contract cannot render an `@IsEmail` / `@IsStrongPassword` message
> against the input that caused it — the message degrades to a form-level banner. The intended key is
> `error`. Per `contradiction-halt.md` this is reported, not silently changed: raise it before
> writing code that depends on either spelling.

### 409 happens, but cannot be declared through the decorator

A `ConflictException` returns a real 409 through `handleError`, but no flag exists for it — add a raw
`@ApiResponse({ status: 409 })` if a specific endpoint must document it. In practice this codebase
prefers 422 for those cases (below). Full throttling policy: `rate-limiting.md`.

### Uniqueness and business validation use 422, not 409

This codebase surfaces uniqueness and business-rule failures as `UnprocessableEntityException` (422)
with the `error: { field: [...] }` shape — **not** `ConflictException` (409). See `service-crud.md`.
So `validation: true` (the default) is the flag that matters on `create` / `update`; a literal 409 is
rare-to-absent here.

## Rules

- **`forbidden: false` is never valid** on an endpoint behind `PermissionGuard` / `RoleGuard` — it
  can throw 403.
- **`validation: false`** on read-only endpoints that accept no body.
- **`unauthorized: false`** only on a route outside `AuthGuard` entirely.
- **`badRequest` on `findAll` is a judgement call here, not an automatic keep.** Unlike sibling
  projects, the list repositories in this codebase **do not throw** on a bad sort or filter: each
  `findAll` builds an allow-list map of sortable columns and silently falls back to `id` when the
  requested sort is not a key, and `FilterValidationPipe` silently drops any `filter[...]` key it
  does not recognise rather than rejecting it. Keep `badRequest: true` (the default) if anything else
  on the path can throw 400; do not justify it by citing sort validation that does not exist.

  > **Recorded, not fixed** (`contradiction-halt.md`): silent coercion means a client that misspells
  > a sort field gets a successful 200 sorted by something else, with no signal that its query was
  > ignored. Worse, `defaultSort` is `"createdAt"` (camelCase) while the allow-list keys are
  > snake_case (`created_at`), so the default never matches and every unsorted list falls back to
  > `id`. Raise this before relying on either behaviour.

## `@ApiSuccessResponse(status, description, example, exampleProperties?)`

The optional 4th argument is a schema describing the `data` shape — e.g.
`ApiSuccessResponse(201, "User created successfully", null, { type: "null" })` for a create that
returns no body. The status in `ApiSuccessResponse(code, ...)`, in `res.status(code)`, and in any
`@HttpCode(code)` must all match: **201 for creation, 200 otherwise**.

## Adding a new endpoint checklist

1. Which exceptions can the **service** throw? Map each to a status.
2. Behind `@PermissionAuth` / `@RoleAuth`? → keep `forbidden` (403).
3. Throws `NotFoundException`? → add `@DefaultApiNotFoundResponse("Entity")`.
4. Accepts a body? → keep `validation` (422), and throw the field map under `error`.
5. Need 409 in Swagger? → add a raw `@ApiResponse` (no flag exists for it).
6. Disabling 429? → the flag is `toManyRequests`, one `o`.
