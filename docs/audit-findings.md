# Audit Findings — clean-nest-drizzle-pg

**Sweep date:** 2026-08-20
**Scope:** focused sweep of the **controller response contract** and the **repository / data layer**,
plus verification of the issues already recorded in `.claude/rules/contradiction-halt.md`.
**Ground truth:** `CLAUDE.md`, `.claude/rules/*.md` (in particular `response-codes.md`,
`repository.md`, `routes.md`, `service-crud.md`), and `.claude/rules/audit-findings.md` for the
writing contract.

**Severity legend:** 🔴 bug · 🟠 inconsistency / latent risk · 🟡 hygiene · 📄 doc
**Evidence:** CONFIRMED (traced end to end) · SUSPECT (something unverified, named below)

> **Status: the owner approved all findings and they have been fixed.** The sweep itself wrote no
> code — fixes were a separate, explicitly requested step, per
> `.claude/rules/audit-findings.md` → "Audits do not fix things".

> **Resolved 2026-08-20.** Fixed in the same session as this sweep. What changed:
> `CustomValidationPipe` now emits the 422 field map under `error`; `resend-verify-email` carries
> `@PermissionAuth("user:update")`; token lifetimes are functions evaluated per token; the five bare
> user endpoints have `@ApiSuccessResponse` + `@DefaultApiNotFoundResponse`; `AuthController`'s eight
> hand-rolled `@ApiResponse` blocks are now `@ApiSuccessResponse` (response-shape `properties`
> preserved); `AuthController` and `AppController` are tagged; the throttler no longer re-exports
> itself. Original findings are kept below unedited — the next auditor needs to see the pattern that
> was wrong, not just that it went away.
> Drizzle-specific: sort allow-lists are camelCase and now **reject** an unknown sort, direction, or
> filter key with a translated `BadRequestException` instead of coercing to `id`; the allow-lists are
> exported as `<entity>SortableFields` / `<entity>FilterableFields` and passed to
> `@ApiDatatableQueries` so `/docs` shows what is enforced; the 429 flag is spelled `tooManyRequests`;
> the dead `|| 60` / `|| 100` throttler fallbacks are gone; `make db-seed` and `make db-reset` no
> longer advertise targets that cannot work.


---

## Coverage

**This was a scoped sweep, not the full 12-category run** defined in
`.claude/commands/audit-flow.md`. Read the two lists below before treating any category as clean.

**Reached and checked:**

| Area | What was actually verified |
|---|---|
| Controller response contract (§7) | Every method in all 6 controllers: verb, path, guards, `@ApiStandardResponses`, success-response decorator, `res.status(n)` vs `ResponseHandler.success(n)` code agreement |
| Repository / data layer (§4, §8) | All 3 repository factories; every user read path checked for the soft-delete filter; sort allow-lists; `columns` selections checked for password exposure; transaction ownership |
| Access control (§2) | Every route in `.claude/rules/routes.md` against its controller decorators |
| Rate limiting config (§10) | `throttler.module.ts` wiring and env plumbing only |
| Constants (§1 partial) | `libs/utils/src/default/` — sort, pagination, token lifetimes |
| Docs drift (§12) | `CLAUDE.md` / `README.md` / `Makefile` claims against the tree |

**Deliberately NOT reached — do not read silence here as "clean":**

- **§1 Auth & token flows end to end.** Token *constants* were checked (§1.1), but the
  register → verify → login and forgot → validate → reset sequences were **not** traced for
  reuse-after-consumption, second-token-revokes-first, or expiry enforcement.
- **§3 Ownership & self-service boundaries** beyond the one route in §2.1.
- **§5 Secrets at rest** — only repository `columns` selections were checked; logs, Swagger
  examples, and error payloads were not swept.
- **§6 i18n catalog parity** — not diffed key-by-key or placeholder-by-placeholder between `en`/`id`.
- **§9 Shared-code duplication**, **§10 cache invalidation / queues**, **§11 schema vs migrations**.
- `node_modules/`, `dist/`, lockfiles, and `.agents/skills/` (vendored bundle; `.claude/skills` is a
  symlink to it, so it is not swept twice).

**Verified correct — checked and found sound:**

- **Soft-delete coverage.** Every user read path filters deleted rows. In `findAll` the filter is
  built once as `whereCondition = isNull(users_table.deleted_at)` and folded into
  `finalWhereCondition`, so the two reads that do not name `deleted_at` on their own line still
  inherit it. The `.select()` at `user.repository.ts:148` is a correlated `exists(...)` subquery over
  `user_roles_table` and correctly does not filter users again. **No gap found.**
- **Password handling.** Only `findByEmail` selects `password`, it is the auth path, and it filters
  `isNull(deleted_at)`. No list or detail selection exposes the hash.
- **Transaction ownership.** No repository opens a transaction — `repository.md` holds.
- **Status-code agreement.** Every `res.status(n)` matches the `ResponseHandler.success(n)` it wraps
  across all controllers. 201 on create, 200 elsewhere. No mismatches.

---

## Top priorities

1. **§2.1** — any logged-in user can send a verification email to any account. Access control. 🔴
2. **§7.1** — field-level validation errors reach clients under a key the documented contract does
   not mention, so forms cannot show per-field messages. 🔴
3. **§8.1** — the default list ordering silently does nothing; every unsorted list is ordered by id. 🟠
4. **§8.2** — a misspelled sort or filter is silently ignored instead of rejected, so a client gets a
   confident 200 over the wrong rows. 🟠
5. **§1.1** — email-verification and password-reset tokens all share one expiry timestamp frozen at
   process start. 🟠
6. **§7.2** — five of the eight user endpoints document no success body in Swagger. 🟠
7. **§7.3 / §12.1 / §12.2** — Swagger tagging, decorator inconsistency, and doc claims that
   contradict the tree. 📄

---

## §1 Auth & token constants

### §1.1 Every verification and reset token shares one expiry, frozen at process start — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `libs/utils/src/default/token-lifetime.ts:3-11`

**What this is.** When someone registers, the app emails them a verification link backed by a row
with an expiry timestamp; the same shape backs password reset. The intended lifetime is "two hours
from when this token was issued". Both lifetimes are exported from `@utils` as named constants and
used wherever a token row is created.

**Why this can happen.** The constants are not functions — they are the *result* of calling
`DateUtils.addHours(DateUtils.now(), 2).toDate()` at module load. `DateUtils.now()` runs exactly once,
when the module is first imported during boot. Every token issued afterwards is stamped with that
same absolute timestamp, computed from process start time rather than from issue time.

**What it costs.** The window shrinks as the process ages. A user registering four hours after the
last deploy gets a token that expired two hours ago and cannot verify their email at all; a user
registering one minute after boot gets very nearly the full two hours. Under PM2 with `autorestart`
the behaviour resets on every restart, which makes it look intermittent and environment-dependent —
the hardest kind of bug to reproduce from a support ticket. Local development hides it completely,
because `make dev` restarts on every file save.

**What we should do.** Convert both to functions — `emailVerificationLifetime()` and
`resetPasswordLifetime()` — and call them at the point each token row is written. Update every call
site (they are few; grep `Lifetime`). Roughly an hour including a test that issues two tokens a
simulated hour apart and asserts different expiries. The same defect exists in
`clean-nest-prisma-pg` — fix both or neither, since they are meant to stay in sync.

---

## §2 Access control

### §2.1 Any authenticated user can trigger a verification email for any account — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `src/settings/users/users.controller.ts:82-83`
(`@Post(":id/resend-verify-email")`), compare siblings at `:54`, `:111`, `:170`, `:193`, `:265`

**What this is.** `UsersController` sits behind `@UseGuards(AuthGuard, PermissionGuard, RoleGuard)`,
which establishes *who* the caller is. Restricting *what* they may do is the job of a per-method
`@PermissionAuth("entity:action")` or `@RoleAuth(...)` decorator. Every other method on the
controller carries one: create is `user:create`, list is `user:list`, update is `user:update`, and so
on.

**Why this can happen.** `POST /users/:id/resend-verify-email` carries `@ApiStandardResponses()` and
`@ApiOkResponse(...)` but **no** `@PermissionAuth` and no `@RoleAuth`. `PermissionGuard` has nothing
to check, so the route is gated by authentication alone. Any user with a valid token — including the
lowest-privilege account in the system — can call it with an arbitrary `:id`.

**What it costs.** Two things. First, it is an unauthenticated-adjacent email trigger: a logged-in
attacker can drive repeated verification mail to any user id they can guess or enumerate, which is a
spam and deliverability problem (your sending domain gets the reputation hit, not theirs). Second,
the response distinguishes a real id from an unknown one, which turns the endpoint into a user-id
oracle for anyone with any account. The global throttler caps this at 60 requests per minute per
client, which limits volume but does not fix the authorization gap.

**What we should do.** Add `@PermissionAuth("user:update")` to match its siblings, or — if the
intent is genuinely self-service — assert the `:id` equals `@CurrentUser().id` and let any
authenticated caller through only for their own account. Fifteen minutes plus a test asserting a 403
for a non-permitted caller. Decide which of the two semantics is wanted before writing it; they are
meaningfully different features. Already recorded in `.claude/rules/routes.md` → "Known gaps" and
`.claude/rules/contradiction-halt.md`.

---

## §7 Response contract

### §7.1 Field-level validation messages reach the client under an undocumented key — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `libs/common/src/pipes/custom-validation/custom-validation.pipe.ts` (`exceptionFactory`,
the `errors: formattedErrors` property), `libs/common/src/response/response.ts:37-52`,
`libs/common/src/decorators/api-response/api-response.decorator.ts:46-60`

**What this is.** When a request body fails its DTO rules, `CustomValidationPipe` collects the
failures into a map of `{ fieldName: ["message", …] }`, translates each message through i18n, and
throws it as a 422. `ResponseHandler.handleError` catches that and spreads the thrown payload onto
the standard error envelope **verbatim**, so whichever key the pipe chose is exactly the key the
client receives. A front-end reads that map to render each message underneath the input that caused
it.

**Why this can happen.** The pipe throws the map under `errors` (plural). Every other part of the
contract says `error` (singular): `@ApiStandardResponses` documents the 422 body with
`error: { field1: [...] }`, and every hand-thrown 422 in `src/` — the uniqueness checks in
`users.service.ts`, `roles.service.ts`, and `auth.service.ts` — uses `error`. Because `handleError`
does not normalise the key, a DTO-level failure and a service-level failure return *different
shapes* from the same status code on the same endpoint.

**What it costs.** A client written against the documented contract looks for `error`, finds nothing
on any DTO validation failure, and cannot attach a message to a field. Every `@IsEmail`,
`@IsStrongPassword`, and `@IsNotEmpty` message degrades to a generic form-level banner or is dropped
— on `POST /users` and `POST /auth/register`, the two endpoints where per-field feedback matters
most. The i18n work that translates those messages into `id` is wasted, because the client never
finds them.

**What we should do.** Rename the key to `error` in the pipe's `exceptionFactory` so both producers
of a 422 agree, then delete the note from `.claude/rules/response-codes.md`. About an hour including
a controller-level test asserting the 422 body shape. Check first whether any existing consumer has
already compensated by reading `errors` — if so, the rename is a breaking change for it and needs
coordinating. The same defect exists in `clean-nest-prisma-pg`.

### §7.2 Five of the eight user endpoints document no success response — 🟠 inconsistency — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `src/settings/users/users.controller.ts` — `GET /users/:id` (`:169`),
`PATCH /users/:id` (`:192`), `PATCH /users/:id/status` (`:216`),
`PATCH /users/:id/password` (`:240`), `DELETE /users/:id` (`:264`)

**What this is.** `/docs` is generated from decorators. `@ApiStandardResponses(...)` declares the
*error* responses an endpoint can produce; a separate decorator — `@ApiSuccessResponse(status, …)`,
or a raw `@ApiOkResponse` / `@ApiCreatedResponse` — declares the success body. `response-codes.md`
treats an endpoint that works but is undocumented in `/docs` as an incomplete change.

**Why this can happen.** Those five methods carry `@ApiStandardResponses({})` (and in three cases an
empty options object, which is just the all-defaults call written the long way) and no success
decorator of any kind. The other three methods on the controller do have one:
`POST /users` uses `@ApiCreatedResponse`, `POST /users/:id/resend-verify-email` uses
`@ApiOkResponse`, and `GET /users` uses the project's own `@ApiSuccessResponse`.

**What it costs.** In the published reference those five endpoints show 400/401/403/422/429/500/503
and no 200 at all. Someone integrating against `/docs` — the audience the Scalar UI exists for —
cannot see the response shape of *reading a user*, *updating a user*, or *deleting a user*, and has
to call the API and observe it. It also means the generated OpenAPI document cannot produce a usable
typed client for those operations.

**What we should do.** Add `@ApiSuccessResponse(200, "<what happened>", <example>)` to each of the
five, matching the existing `GET /users` usage. Under an hour for all five. Fold in §7.3 while you
are in the file. Identical in `clean-nest-prisma-pg`.

### §7.3 Three different decorators are used for the same job — 🟡 hygiene — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `src/auth/auth.controller.ts` (raw `@ApiResponse({...})` on all 8 methods),
`src/settings/users/users.controller.ts:56` (`@ApiCreatedResponse`), `:84` (`@ApiOkResponse`),
`:116` (`@ApiSuccessResponse`); compare `src/settings/roles/roles.controller.ts` and
`permissions.controller.ts`, which use `@ApiSuccessResponse` throughout

**What this is.** The project ships `@ApiSuccessResponse(status, description, example, schema?)` in
`@common` specifically so success bodies are declared one way and rendered in the standard envelope
shape (`{ code, success, message, data }`).

**Why this can happen.** `AuthController` predates or ignores the helper and hand-rolls
`@ApiResponse({ status, description, schema: { example: {...} } })` on every method.
`UsersController` uses three different mechanisms across three adjacent methods. Roles and
Permissions use the helper consistently.

**What it costs.** No runtime impact — this is documentation shape only. The cost is drift: the
envelope is spelled out by hand in eight places in `AuthController`, so a change to the standard
response shape has to be applied eight times and will be missed somewhere. It also makes §7.2 easy to
introduce, because there is no single decorator whose absence is obvious.

**What we should do.** Migrate `AuthController` and the two odd methods in `UsersController` to
`@ApiSuccessResponse`. Mechanical, roughly two hours. Worth doing in the same pass as §7.2. If the
helper cannot express something `AuthController` needs (the login response embeds tokens), extend
the helper rather than keeping the exception — and write that down in `response-codes.md`.

---

## §8 Sort, filter, and list behaviour

### §8.1 The default sort matches nothing, so every unsorted list is ordered by id — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `libs/utils/src/default/sort.ts:1` (`defaultSort = "createdAt"`),
`libs/repositories/src/repositories/user.repository.ts:100` and `:165-180`;
same shape in `role.repository.ts:53` and `permission.repository.ts:34`

**What this is.** A list endpoint accepts `?sort=`. The controller falls back to the shared
`defaultSort` constant when the caller sends nothing. The repository then maps that string to a real
column through an allow-list object, which exists so an arbitrary caller-supplied string can never
reach the query builder.

**Why this can happen.** The allow-list is keyed in **snake_case** — `id`, `name`, `email`,
`status`, `created_at`, `updated_at` — because those are the Drizzle column names. `defaultSort` is
`"createdAt"` in **camelCase**. `"createdAt"` is therefore not a key, the membership test fails, and
`normalizedOrderBy` falls through to its `"id"` fallback. The code reads as though the default is
newest-first by creation date; it is actually by id.

**What it costs.** Every list endpoint called without an explicit `sort` returns rows ordered by id,
not by creation date. With UUID primary keys that ordering is effectively arbitrary, so the default
user list is in no meaningful order, and paging through it is not stable in any way a user would
expect. Nobody sees an error, which is why this survives: the endpoint returns 200 with plausible
data. This is also a silent divergence from `clean-nest-prisma-pg`, whose `allowedSort` *does*
contain `createdAt` and which therefore behaves as documented — the two templates disagree on their
default list order.

**What we should do.** Pick one casing and use it everywhere. Given the allow-lists mirror real
column names, changing `defaultSort` to `"created_at"` is the smaller change — but note that also
changes the public API, since callers pass these same strings in `?sort=`. Decide whether the wire
format is camelCase (then map it to columns) or snake_case (then fix the constant), and apply it to
all three repositories. Half a day including tests asserting the default ordering. Do not fix this
without deciding §8.2 at the same time — they are the same design question.

### §8.2 An invalid sort or filter is silently ignored rather than rejected — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `libs/repositories/src/repositories/user.repository.ts:174-180` (the `: "id"` fallback),
`libs/common/src/pipes/filter-validation/filter-validation.pipe.ts:17-33`

**What this is.** Two separate mechanisms sanitise list query parameters. The repository allow-list
maps `?sort=` to a real column. `FilterValidationPipe` parses `filter[key]=value` pairs out of the
query string into a plain object for the repository to consume.

**Why this can happen.** Neither rejects bad input. The sort allow-list falls back to `"id"` for
anything it does not recognise. The filter pipe iterates the query keys, keeps the ones matching
`filter[...]` whose value is a primitive, and **silently discards everything else** — returning
`null` when nothing survived. There is no error path in either.

**What it costs.** A client that misspells `?sort=craetedAt` or sends `filter[emial]=x` gets HTTP
200 and a confident-looking page of results — sorted by the wrong column, or filtered not at all.
The caller cannot distinguish "your filter matched these 40 users" from "your filter was gibberish
so here is every user". For a filter on a permissions screen, "here is every user" is the dangerous
reading. The same class of mistake in `clean-nest-prisma-pg` produces a `BadRequestException` (400)
from `user.repository.ts:69-80`, so the two templates behave differently on identical malformed
input, and `response-codes.md` had to be written differently for each.

**What we should do.** Decide the intended contract and make both repos agree. Rejecting is the more
defensible default and matches the Prisma sibling: throw `BadRequestException` with
`message.common.invalid_sort_field` (the i18n key already exists in the Prisma repo's catalogs and
would need adding here) when the sort is not in the allow-list, and have `FilterValidationPipe`
reject unknown filter keys rather than drop them. Half a day across the three repositories plus the
pipe, plus `en`/`id` catalog entries. If silent coercion is deliberate, say so in
`repository.md` — right now nothing documents it.

---

## §12 Documentation drift

### §12.1 `AuthController` and `AppController` are untagged in Swagger — 📄 doc — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `src/auth/auth.controller.ts:22` (`@Controller("auth")` with no `@ApiTags`),
`src/app.controller.ts:9`; compare `health.controller.ts:11`, `users.controller.ts:45`,
`roles.controller.ts:37`, `permissions.controller.ts:38`

**What this is.** `@ApiTags("...")` groups a controller's routes under a heading in the API
reference. `swaggerConfig` declares no explicit `.addTag(...)` calls, so tags exist only where a
controller declares one, and untagged controllers fall into an unnamed default bucket.

**Why this can happen.** Four controllers are tagged (`Health`, `Settings/Users`, `Settings/Roles`,
`Settings/Permissions`). `AuthController` and `AppController` are not.

**What it costs.** The eight authentication routes — login, register, verify, forgot/reset password,
profile — are the first thing a new integrator looks for, and they are the ones scattered into an
untitled group while the CRUD screens are neatly organised. It reads as an oversight in a reference
that is otherwise carefully structured.

**What we should do.** Add `@ApiTags("Auth")` to `AuthController`. `AppController` is a single
unauthenticated welcome route, so it matters less, but tag it too for consistency. Ten minutes.
Recorded in `.claude/rules/routes.md` → "Known gaps".

### §12.2 `CLAUDE.md` documents a test file that does not exist, and two Makefile targets that cannot work — 📄 doc — CONFIRMED — ✅ RESOLVED 2026-08-20

**Where:** `CLAUDE.md` (Commands → `bun run test -- src/settings/users/users.service.spec.ts`),
`Makefile` (`db-seed` target and the `db-reset` entry in `help` and `.PHONY`), `package.json`
(no `seed` script)

**What this is.** `CLAUDE.md` and `make help` are the two places a newcomer looks to find out what
they can run.

**Why this can happen.** Three separate claims are untrue against the current tree.
(1) `CLAUDE.md` shows how to run a single spec file and names
`src/settings/users/users.service.spec.ts`; the repository contains **zero** `*.spec.ts` files
anywhere, so `bun run test` matches nothing.
(2) `make db-seed` runs `bun run seed`, but there is no `seed` script in `package.json` and no seed
files in the repository — the target has never worked.
(3) `make db-reset` is advertised in `make help` and listed in `.PHONY`, but **no target with that
name is defined**, so invoking it fails with "No rule to make target".

**What it costs.** Every one of these fails at the moment a new contributor tries the documented
command, which is the worst possible time. The seeder gap is the expensive one: without seed data
there is no RBAC permission catalog, so nothing validates the `entity:action` strings that
`@PermissionAuth` depends on — an audit cannot tell a real permission from a typo, and neither can a
reviewer. The Prisma sibling ships a seeder that creates
`{user,role,permission}:{list,create,view,update,delete,restore}` plus default roles and a superuser.

**What we should do.** Three independent fixes: delete or correct the spec-file example in
`CLAUDE.md` (or add the spec it names); port a seeder from `clean-nest-prisma-pg` and add the `seed`
script, which is the substantial one at roughly a day; and either implement `db-reset` or remove it
from `help` and `.PHONY`. The doc corrections are minutes. Per `.claude/rules/documentation.md` these
should not have survived a change to the code they describe.

---

## Recorded elsewhere, still open

Confirmed during this sweep and already written into `.claude/rules/contradiction-halt.md`. Listed
here so the report is self-contained; not re-numbered.

- **`ThrottlerModule` re-exports itself** (`exports: [ThrottlerModule]`) — inert, since the guard is
  global via `APP_GUARD`, but it exports nothing usable. 🟡
- **Dead throttler fallbacks.** `ttl: seconds(getEnv().THROTTLER_TTL || 60)` and
  `limit: Number(getEnv().THROTTLER_LIMIT) || 100` — envalid already defaults both to 60, so the
  `||` branches fire only when a value is `0`, at which point `THROTTLER_LIMIT=0` (meaning "block
  everything") silently becomes 100. The Prisma sibling has no such fallbacks. 🟠
- **`toManyRequests`**, the 429 flag on `@ApiStandardResponses`, is missing an `o`. Passing the
  correctly-spelled `tooManyRequests` is silently ignored, so an attempt to *disable* 429
  documentation fails quietly. 🟡
