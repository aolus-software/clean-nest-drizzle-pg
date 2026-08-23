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

---

# Sweep 2 — full code-level read (2026-08-23)

**Sweep date:** 2026-08-23
**Scope:** the first pass of the end-to-end code read requested as item 4 in the workspace handoff —
`libs/common` (guards, strategy, decorators, cache, mail, throttler, response handler), `libs/config`
(env validation), `libs/repositories` (user / role / permission repositories, seeds), `src/auth`
(controller + service), and the guard wiring on all three `src/settings` controllers. Item 7 (BullMQ
wiring, CI workflow, dependency currency) is folded in.
**Ground truth:** `CLAUDE.md`, `.claude/rules/*.md`, and the running code. Where a claim is
cross-checked against the sibling `clean-nest-prisma-pg`, that is stated in the finding.

**Severity legend:** 🔴 bug · 🟠 inconsistency / latent risk · 🟡 hygiene · 📄 doc
**Evidence:** CONFIRMED (traced end to end) · SUSPECT (something unverified, named below)

> **Read-only. Nothing below has been fixed.** Per `.claude/rules/audit-findings.md` → "Audits do not
> fix things", and per the handoff's explicit instruction that item 4 stays read-only until the
> findings are agreed. "What we should do" describes a fix; it does not perform one.

**Section numbers use an `R` prefix** (`§R1`–`§R6`) so they never collide with the `§1`–`§12` sweep
above, whose findings are all resolved.

> ## ✅ All 20 findings above were approved and fixed on 2026-08-23
>
> The sweep itself wrote no code. Fixes were a separate, explicitly approved step, per
> `.claude/rules/audit-findings.md` → "Audits do not fix things". Original finding text is kept
> unedited below — the next auditor needs to see the pattern that was wrong, not just that it went
> away.
>
> **Everything was verified against a running instance**, not by re-reading. The stack was brought
> up, migrated and seeded, and each finding was reproduced before the fix and re-checked after. That
> is how §R4.4 moved from SUSPECT to CONFIRMED, and how two defects that were not in this report at
> all were found — see §R2.5 and §R2.6, appended below.
>
> **Decisions taken with the owner**, since three findings were trade-offs rather than plain bugs:
> the enumeration leak is closed everywhere (§R1.3, §R1.4) at the cost of the more helpful login
> message; `@PermissionAuth` is conjunctive (§R2.2); and all three guards were promoted to
> `APP_GUARD` with a new `@Public()` decorator (§R2.1, §R2.4), which required making `AuthGuard`
> global too — a naive promotion returns 403 instead of 401 for unauthenticated requests, because
> global guards run before controller-scoped ones.
>
> **Sequencing that mattered:** §R3.1 was fixed *with* §R2.3, never before it. Correcting the cache
> TTL alone would have widened the stale-authorization window from ~3.6 seconds to a full hour.



## Coverage

**Reached and read:**

- `libs/common/src/guards/**` — all three guards, line by line
- `libs/common/src/strategies/auth.strategy.ts`, `decorators/{permission-auth,role-auth,current-user}`
- `libs/common/src/cache/**` — service, module, key builder, and every call site in the tree
- `libs/common/src/mail/**` — service, processor, module, template inventory
- `libs/common/src/response/response.ts` — the error path in full
- `libs/common/src/throttler/throttler.module.ts`
- `libs/config/src/env/index.ts` — the envalid schema
- `libs/repositories/src/repositories/{user,role,permission}.repository.ts` — the `findAll` filter,
  sort, and soft-delete paths; `findByEmail` column selection
- `libs/repositories/src/seed/permission.seed.ts` — the catalogue, cross-checked against every
  `@PermissionAuth` / `@RoleAuth` string in `src/`
- `src/auth/auth.service.ts` — all seven methods, end to end
- `src/main.ts`, `src/app.module.ts`, `src/settings/settings.module.ts`
- Guard and permission decorators on all three settings controllers
- `.github/workflows/build.yaml`; `bun outdated`

**Not reached in this pass — do not read these as clean:**

- The three settings controllers' **method bodies** and their Swagger decorators (only the guard
  wiring was checked)
- `src/settings/**/*.service.ts` — the CRUD services
- All DTOs (`src/**/dto/*.ts`)
- `libs/common/src/pipes/**`, `interceptors/**`, the `api-response` / `api-datatable-queries`
  decorators
- `libs/utils/src/{date,string,number,encryption,logger}` — ~800 lines of helpers
- `libs/repositories/src/schema/**` and the migrations
- `src/health`, `src/app.controller.ts`
- The i18n catalogues themselves (`en`/`id` key parity)

## Top priorities

Ordered security → data integrity → correctness → hygiene.

1. **Any authenticated user can create, edit, and delete permissions** — the superuser gate on that
   controller is silently inert (§R2.1).
2. **Password reset is impossible, and email verification accepts only already-used tokens** — one
   inverted predicate, three call sites (§R1.1, §R1.2).
3. **A revoked role or permission stays in force until the cached user expires, and nothing
   invalidates it** — currently masked by a second bug (§R2.3, §R3.1).
4. **Combining two filters on the user list silently drops all but the last** (§R4.1).
5. **`filter[name]` on the role list can never match anything** (§R4.2).
6. **An out-of-range `filter[status]` reaches Postgres unchecked and 500s** (§R4.3).
7. **The verification email is enqueued inside the database transaction that creates its token**
   (§R5.1).

---

## §R1 Authentication and token flows

### §R1.1 Email verification accepts only tokens that have already been used — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/auth/auth.service.ts:207-213` (the lookup), `:238-252` (the write),
`src/auth/auth.service.ts:51-58` (the login check that depends on it)

**What this is.** Registration writes a row to `email_verifications` holding a random token and mails
the user a link containing it. `verifyEmail` looks that token up, checks it has not expired, then
stamps `users.email_verified_at` and the token's `used_at` inside one transaction. Logging in
requires `email_verified_at` to be set, so this flow is the only route from "registered" to "can log
in".

**Why this can happen.** The lookup filters on `isNotNull(email_verifications_table.used_at)` — it
asks for tokens whose `used_at` **is** set, i.e. tokens that have already been consumed. The
predicate is inverted; `isNull` is what the flow needs:

```ts
where: and(
    eq(email_verifications_table.token, data.token),
    isNotNull(email_verifications_table.used_at),   // ← only matches spent tokens
),
```

A freshly issued token has `used_at = NULL`, so it does not match and the caller gets
`invalid_verification_token`. A token that has been used once still matches, and because there is no
`used_at` check anywhere after the lookup, it is re-accepted for as long as it has not expired.

**What it costs.** Two things, one a denial and one a security weakness:

- **Nobody who self-registers can ever verify their email**, and therefore nobody who self-registers
  can ever log in. The flow is dead end to end. Only seeded users, whose `email_verified_at` is
  written directly by `user.seed.ts`, can authenticate.
- **A spent verification token is replayable** until its two-hour expiry. Single use is not merely
  unenforced here, it is inverted — being spent is the entry condition.

**What we should do.** Change `isNotNull` to `isNull` at `:211`. That alone fixes both halves,
because an unspent token is exactly what should match and a spent one then falls out. Consider adding
the explicit post-lookup `used_at` guard that `resetPassword` already has, so the intent is legible
at the call site rather than resting on one predicate. Minutes to change; the value is in testing it,
since nothing here has a regression test. The sibling `clean-nest-prisma-pg` gets this right — it
queries on `token` alone and checks `usedAt` in code (`src/auth/auth.service.ts:184-198`) — so the
Prisma version is the reference for intent.

### §R1.2 Password reset can never succeed — the query and the guard that follows it are mutually exclusive — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/auth/auth.service.ts:318-341` (`resetPassword`), `:293-306`
(`isResetPasswordTokenValid`)

**What this is.** "Forgot password" writes a row to `password_reset_tokens` and mails a link. The
front end calls `isResetPasswordTokenValid` to decide whether to render the form, and `resetPassword`
to perform the change. Both look the token up, reject it if spent or expired, then (for
`resetPassword`) hash the new password and stamp `used_at` in one transaction.

**Why this can happen.** Both methods carry the same inverted predicate as §R1.1 — and here it
contradicts the very next statement:

```ts
const resetPassword = await db.query.password_reset_tokens.findFirst({
    where: and(
        eq(password_reset_tokens_table.token, data.token),
        isNotNull(password_reset_tokens_table.used_at),   // row must be spent to match
    ),
});
if (!resetPassword) { throw ... }
if (resetPassword.used_at) { throw ... }                  // ...and is then rejected for being spent
```

Every row the query can return is rejected by the check two lines later. There is no input for which
this succeeds. That mutual exclusivity is also the clearest evidence the predicate was meant to be
`isNull`: with `isNull`, the query returns unspent rows and the `used_at` check becomes a harmless
belt-and-braces guard.

**What it costs.** `POST /auth/reset-password` always returns 422 `invalid_reset_token`, and the
token-validation endpoint always returns `false`. **Password reset is completely unusable**, for
every user including seeded ones. Combined with §R1.1 there is no self-service path back into an
account.

**What we should do.** Change `isNotNull` to `isNull` at `:296` and `:321`. Keep the existing
`used_at` checks — with the predicate corrected they become the real single-use guard, which is where
that logic reads most clearly. Note the fix leaves one behaviour worth a separate decision: neither
flow revokes the user's *other* outstanding reset tokens on success, so several live links can exist
at once. Both Elysia siblings spend every outstanding token for the user on consumption; this repo
spends only the one presented.

### §R1.3 Login reveals whether an address is registered, and its account state, before checking the password — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/auth/auth.service.ts:41-80`

**What this is.** `login` looks the user up by email, then runs three checks in order — email
verified, status active, password correct — throwing a different message for each.

**Why this can happen.** The verification and status checks sit **above** the password comparison, so
they are reachable with any password at all. An unknown address returns `invalid_credentials`; a
known-but-unverified address returns `verify_email_required`; a known-but-suspended address returns
`account_inactive`.

**What it costs.** An unauthenticated caller can enumerate which addresses hold accounts, and learn
each one's verification and activation state, by sending one request per address with a junk
password. That turns a user list into a target list — useful for credential stuffing and for phishing
that names the victim's real account state.

**What we should do.** Move the password comparison above the verification and status checks, so a
wrong password fails identically whatever the account state; or return `invalid_credentials` for all
three and surface the real reason only after the password matches. This is a deliberate
product trade-off — telling a legitimate user "verify your email" is genuinely more helpful — so it
wants a decision, not a silent change. The same ordering exists in `clean-nest-prisma-pg`.

### §R1.4 The "silent" endpoints are only silent for addresses that do not exist — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/auth/auth.service.ts:173-185` (`resendVerificationEmail`), `:255-268`
(`forgotPassword`)

**What this is.** Both methods `return` early with no error when the address is unknown — the
standard defence against using them to enumerate accounts.

**Why this can happen.** The silence stops one line later. `resendVerificationEmail` throws
`email_already_verified` when the address exists and is verified; `forgotPassword` throws when the
address exists and is *not* verified. So each endpoint answers a different half of the same question,
and between them a caller learns both whether an address exists and its verification state.

**What it costs.** The enumeration defence does not hold. A 200 with an empty body means "no such
account", a 422 means "account exists" — and which 422 tells you its state. This is the same
disclosure as §R1.3 but on endpoints that were explicitly written to prevent it, which is why it is
worth its own entry.

**What we should do.** Return early and silently in both branches — the caller learns nothing either
way, and a user who has already verified simply receives no mail. If the "already verified" feedback
is wanted for UX, it belongs behind an authenticated endpoint, not a public one. Decide it together
with §R1.3, since they are the same question.

---

## §R2 Access control

### §R2.1 Any authenticated user can create, edit, and delete permissions — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/settings/permissions/permissions.controller.ts:39-43` (the class decorators),
`libs/common/src/guards/role/role.guard.ts:16-24` (the metadata read),
`libs/common/src/decorators/role-auth/role-auth.decorator.ts:3`

**What this is.** RBAC here is decorator-driven. `@UseGuards(AuthGuard, RoleGuard)` attaches the
guards, and `@RoleAuth("superuser")` declares which role a caller must hold. `RoleGuard` reads that
declaration back through NestJS's `Reflector` and throws `ForbiddenException` when the caller does
not qualify. `PermissionsController` is gated this way — and only this way; unlike the users and
roles controllers, none of its five methods carries a per-method permission.

**Why this can happen.** `@RoleAuth("superuser")` is applied at **class** level (line 41), but the
guard only ever looks at the **handler**:

```ts
const requiredRoles = this.reflector.get<string[]>("roles", context.getHandler());
if (!requiredRoles) {
    return true;                                  // ← every method takes this branch
}
```

`SetMetadata` on a class stores the metadata on the class, not on each method, and
`reflector.get(key, context.getHandler())` never consults the class. So `requiredRoles` is
`undefined` on all five handlers and the guard returns `true` before checking anything. The failure
is silent: the decorator is present, the guard is registered, `/docs` shows the lock icon, and
nothing is enforced.

**What it costs.** Every route on `/settings/permissions` — `POST`, `GET`, `GET /:id`, `PATCH /:id`,
`DELETE /:id` — is protected by authentication alone. A user who self-registers and logs in can:

- **delete the permission catalogue.** Permission rows are what every `@PermissionAuth` string
  resolves against, so deleting them revokes authorization for every non-superuser in the system — a
  denial of service against the whole application, from an unprivileged account.
- **rename an existing permission.** This is the escalation path: a caller who holds *any* permission
  through a role — say an `admin` holding `user:list` — can rename that permission row to
  `user:delete`. The role-to-permission link is by row id, so the caller's flattened permission list
  now contains whatever name they chose, and `PermissionGuard` will honour it.

**What we should do.** Read both targets in the guard, which is the standard NestJS idiom and makes
class-level declarations work as they appear to:

```ts
const requiredRoles = this.reflector.getAllAndOverride<string[]>("roles", [
    context.getHandler(),
    context.getClass(),
]);
```

Apply the same change to `PermissionGuard` (`libs/common/src/guards/permission/permission.guard.ts:17-20`),
which has the identical read and would fail the identical way the moment anyone puts
`@PermissionAuth` on a class. Then audit every controller for class-level auth decorators — this is
the only one today. **The identical defect is present in `clean-nest-prisma-pg`**, same file, same
lines; fix both together. Under an hour, but it needs a request against a running server to confirm,
not a re-read — the whole point is that this one looks correct on the page.

### §R2.2 A route requiring two permissions is satisfied by holding either one — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/common/src/guards/permission/permission.guard.ts:39-41`

**What this is.** `@PermissionAuth(...)` is variadic — `PermissionAuth = (...args: string[])` — so a
route can name several permissions, and the natural reading of "requires `user:update` and
`role:update`" is that the caller must hold both.

**Why this can happen.** The guard uses `.some(...)`:

```ts
const hasPermission = requiredPermissions.some((permission) =>
    user.permissions.includes(permission),
);
```

That is OR, not AND. Every route in the tree today names exactly one permission, so nothing is
currently mis-gated — this is latent, not live. It becomes live the first time someone writes
`@PermissionAuth("user:update", "role:update")` expecting a conjunction and gets a disjunction, which
grants access to callers holding only the weaker of the two.

**What it costs.** Nothing today. The moment a multi-permission route is added, that route is gated
at the level of its *least* restrictive permission, silently — there is no error and no log.

**What we should do.** Decide the intended semantics and make the code and the decorator agree. Both
Elysia siblings use `.every(...)` (AND) and their `rbac.md` states it explicitly, so AND is the house
reading; switching to `.every` matches it and breaks nothing, since no route lists more than one
permission. Whichever is chosen, state it in `.claude/rules/` — no rule file currently says. Note
`RoleGuard` has the same `.some(...)` at `:39-41`, where OR is arguably the right semantics for
roles; if the two guards are to differ, that difference should be written down rather than inferred.

### §R2.3 A revoked role or permission stays in force — nothing invalidates the cached user — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/common/src/strategies/auth.strategy.ts:24-38` (the read and populate),
`src/auth/auth.service.ts:83`, `:94-98` (the only two cache writes in the tree),
`libs/common/src/cache/const.ts:1`

**What this is.** On every authenticated request, `AuthStrategy.validate` resolves the caller's
identity — roles plus a flattened permission list — and both guards decide from that object. To avoid
a database round trip per request it is cached in Redis under `user:<id>`, read first and only
rebuilt from `UserRepository().UserInformation()` on a miss.

**Why this can happen.** `user:<id>` is written in exactly two places, both in `login`, and deleted in
exactly one, also in `login`. Grepping the whole tree for `UserCache(` returns four call sites and
none of them is in `src/settings/`. So when an administrator changes a user's roles through
`PATCH /settings/users/:id`, or changes a role's permissions through `PATCH /settings/roles/:id`, the
cached authorization data for every affected user is left untouched.

**What it costs.** Revoking access does not revoke access. A user whose `admin` role is removed keeps
every permission that role carried until their cache entry expires or they log in again — and logging
out does not help, because nothing clears the entry on logout either. The same applies in reverse:
granting a permission does not take effect until the entry expires. For an operator responding to a
compromised or departing account, "I removed their role" is not true at the moment they believe it is.

**The window is currently small, and only by accident.** §R3.1 means cache entries expire after
roughly 3.6 seconds rather than the intended hour. That is what keeps this from being severe today —
and it is exactly why the two findings must be read together: **fixing §R3.1 on its own widens this
window from seconds to a full hour.**

**What we should do.** Delete the cache entry wherever authorization data changes — the user update
path, the role update path (for every user holding that role), and the delete path. `CacheService.del`
already exists and `UserCache(userId)` is the key builder; the role case needs the affected user ids,
which `UserRepository` can supply. Half a day including the role fan-out. Fix this **before or with**
§R3.1, never after. The identical gap exists in `clean-nest-prisma-pg`.

### §R2.4 `RoleGuard` is not registered on the roles controller — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/settings/roles/roles.controller.ts:37`

**What this is.** A guard only runs if it is listed in `@UseGuards`. `UsersController` registers all
three (`AuthGuard, PermissionGuard, RoleGuard`), which is why its method-level
`@RoleAuth("superuser")` at `:261` works.

**Why this can happen.** `RolesController` registers only `AuthGuard, PermissionGuard`. Adding
`@RoleAuth("superuser")` to a method there would compile, read correctly, appear in review — and do
nothing, because no guard is present to read the metadata.

**What it costs.** Nothing today; no role-gated route exists on that controller. It is a loaded
footgun of the same family as §R2.1 — an auth decorator that is present and inert.

**What we should do.** Register all three guards on every settings controller, so the decorators are
always live regardless of which one a future route uses. One line per controller. Alternatively,
promote both guards to `APP_GUARD` alongside `ThrottlerGuard` — they already no-op when their
metadata is absent, so global registration is safe and removes the class of mistake entirely. That is
the more durable fix and worth considering together with §R2.1.

---

## §R3 Cache

### §R3.1 Cached entries expire after 3.6 seconds instead of an hour — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/common/src/cache/cache.service.ts:10-13`,
`libs/common/src/cache/cache.module.ts:16`, `libs/config/src/env/index.ts:90`

**What this is.** `REDIS_TTL` is an envalid-validated number defaulting to `3600`, and its name and
default both say seconds. `CacheModule` registers the store with a default TTL, and `CacheService.set`
passes a per-key TTL on each write.

**Why this can happen.** The two disagree about units. The module multiplies:

```ts
ttl: (Number(getEnv().REDIS_TTL) || 3600) * 1000,      // cache.module.ts:16 — milliseconds
```

The service does not:

```ts
const ttlValue = ttl ? ttl : Number(getEnv().REDIS_TTL || 3600);
await this._cacheManager.set(key, value, ttlValue);     // cache.service.ts:11-12 — 3600 what?
```

`cache-manager` v7, which `@nestjs/cache-manager` v3 wraps, takes the TTL in **milliseconds** — the
module's own `* 1000` is the evidence. So every explicit `set` gets 3600 ms. Since `AuthStrategy`
always passes `null`, every cached user gets 3.6 seconds.

Two smaller edges in the same three lines: `ttl ? ttl : ...` treats an explicit `0` as "not
supplied", so a caller cannot express "no expiry"; and the `|| 3600` fallback is dead, because
envalid has already applied that default and would have exited at boot if the value were unusable.

**What it costs.** The user cache is doing almost nothing — past the first few seconds of a session,
practically every authenticated request rebuilds `UserInformation` from Postgres, which is a
multi-table read with role and permission joins on the hot path of every request. That is the whole
cost today, and it is a performance one.

**The interaction is the important part.** This bug is what currently limits §R2.3's stale-permission
window to a few seconds. Correcting the units in isolation — a one-token change that looks purely
like a performance fix — silently converts a 3.6-second authorization staleness window into a
one-hour one.

**What we should do.** Multiply in the service, matching the module: `const ttlValue = (ttl ??
Number(getEnv().REDIS_TTL)) * 1000;`, and use `??` so `0` means what it says. Drop the dead `|| 3600`.
**Do not ship this without §R2.3's invalidation**, and say so in the commit message. Minutes for the
change; the sequencing is the real content. The identical mismatch is in `clean-nest-prisma-pg`
(`cache.service.ts:11` against `cache.module.ts:18`).

---

## §R4 List queries — filtering and sorting

### §R4.1 Combining two filters on the user list silently drops all but the last — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/repositories/src/repositories/user.repository.ts:150-190`

**What this is.** `GET /settings/users` accepts `filter[status]`, `filter[name]`, `filter[email]`, and
`filter[role_id]`, each mapping to a `WHERE` fragment. Sending two is a conjunction: "active users
named jane".

**Why this can happen.** Each block **assigns** to the accumulator instead of appending to it, and
re-bases on `whereCondition` rather than on the accumulator:

```ts
let filteredCondition: SQL | undefined = undefined;
if (filter.status) { filteredCondition = and(whereCondition, eq(...)); }
if (filter.name)   { filteredCondition = and(whereCondition, ilike(...)); }   // discards status
if (filter.email)  { filteredCondition = and(whereCondition, ilike(...)); }   // discards name
if (filter.role_id){ filteredCondition = and(whereCondition, exists(...)); }  // discards email
```

Only the last populated filter survives. The sibling repositories in the same folder get this right —
`role.repository.ts:100-106` and `permission.repository.ts:84-98` both append with
`and(filterConditions, ...)` — so this is one file's slip, not the house pattern.

**What it costs.** `filter[status]=active&filter[name]=jane` returns every user named jane regardless
of status, with a 200 and no warning. The caller cannot distinguish that from a correct result, and
any UI that treats the list as filtered will show and act on rows the operator excluded. This is the
same defect Tier 9 found and fixed in `clean-elysia`.

**What we should do.** Append to the accumulator and let it start from `whereCondition`:
`filteredCondition = and(filteredCondition, eq(...))`, seeded as
`let filteredCondition: SQL | undefined = whereCondition;`. Then drop the redundant re-AND at
`:191-194`, which currently combines `whereCondition` with a value that already contains it. Under an
hour, and it needs a two-filter request to verify. `clean-nest-prisma-pg` composes by object spread
and is **not** affected.

### §R4.2 `filter[name]` on the role list can never match anything — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/repositories/src/repositories/role.repository.ts:100-106`

**What this is.** `name` is the only filterable field the role list offers —
`roleFilterableFields = ["name"]` — so this parameter is the entire filtering capability of that
endpoint.

**Why this can happen.** The value is wrapped in SQL wildcards and then passed to an **equality**
comparison:

```ts
filterWhereCondition = and(
    filterWhereCondition,
    eq(roles_table.name, `%${filter.name.toString()}%`),
);
```

`eq` renders `=`, which does not interpret `%`. The generated predicate is `name = '%admin%'`,
matching only a role literally named `%admin%`. The wildcards are proof that `ilike` was intended —
`user.repository.ts:159-163` uses exactly that for its name filter.

**What it costs.** `GET /settings/roles?filter[name]=admin` returns an empty page with a 200. A
caller sees "no roles match" for a role that plainly exists, and there is nothing in the response to
suggest the query was malformed rather than genuinely empty.

**What we should do.** Use `ilike(roles_table.name, \`%${...}%\`)`, matching the user repository. One
line. While there, decide the semantics across all three list endpoints — see §R4.5.

### §R4.3 An out-of-range status filter reaches Postgres unchecked and returns 500 — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/repositories/src/repositories/user.repository.ts:153-157`

**What this is.** `status` is a Postgres enum column (`user_status`), and `filter[status]` is
allow-listed by **key** — the repository confirms `status` is a filterable field before building the
`WHERE`.

**Why this can happen.** The key is checked; the **value** is not. It is cast straight through:

```ts
eq(users_table.status, filter.status as UserStatusEnum)
```

`as` is a compile-time assertion with no runtime effect, so any string the caller sends is handed to
Drizzle and then to Postgres as an enum literal. Postgres rejects an unknown enum value with
`invalid input value for enum user_status`, which surfaces as an unhandled driver error.

**What it costs.** `GET /settings/users?filter[status]=BOGUS` returns **500**, not the 400 the
allow-list machinery exists to produce. A typo in a client query looks like a server fault; it is
noise in error monitoring, and it hands an unauthenticated-adjacent caller a cheap way to generate
500s. This is the same defect Tier 8 found in both Elysia repos.

**What we should do.** Validate the value against the enum before building the predicate and throw
the same translated `BadRequestException` the key check already throws, naming the allowed set. The
enum members are available from the schema, so the check should read from there rather than restating
them. Under an hour. The same unchecked cast exists in `clean-nest-prisma-pg`
(`user.repository.ts:116-121`), where an invalid value produces a Prisma validation error instead.

### §R4.4 `?search=` 500s on the user list because it pattern-matches an enum column — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/repositories/src/repositories/user.repository.ts:129-138`

**What this is.** The free-text `search` parameter ORs a case-insensitive match across several
columns.

**Why this can happen.** One of the three columns it searches is `status`, which is a Postgres enum,
not text:

```ts
or(
    ilike(users_table.name, `%${search}%`),
    ilike(users_table.email, `%${search}%`),
    ilike(users_table.status, `%${search}%`),   // enum column
),
```

Postgres has no `ILIKE` operator for a user-defined enum type; matching one requires an explicit cast
to `text`. If Drizzle emits `"status" ILIKE $1` without that cast, the statement fails with
`operator does not exist: user_status ~~* unknown`.

**Settled by running it, 2026-08-23.** `GET /settings/users?search=a` against a live instance
returned **500**. Drizzle emits `"status" ILIKE $1` with no cast and Postgres rejects it. This was
filed as SUSPECT and is now CONFIRMED — it outranks §R4.3, because `search` is the parameter a UI
wires to its search box.

**What it costs, if confirmed.** Every free-text search on the user list returns 500 — the single
most-used query parameter on the most-used list endpoint, broken outright.

**What we should do.** Settle it with the request above before doing anything. If confirmed, drop
`status` from the search columns (searching a four-value enum by substring is of little use anyway)
or cast explicitly. Do not "fix" it speculatively — this is a SUSPECT precisely because it is
cheap to verify and the answer decides whether it is a one-line change or a non-issue.

### §R4.5 `filter[name]` means three different things on three endpoints — 🟠 inconsistency — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `user.repository.ts:159-163`, `role.repository.ts:100-106`,
`permission.repository.ts:92-97`

**What this is.** All three list endpoints advertise a `name` filter through the same
`@ApiDatatableQueries` machinery, and `/docs` presents them identically.

**Why this can happen.** Each repository implements it differently: users does substring
(`ilike '%x%'`), permissions does exact equality (`eq`), and roles does equality against a
wildcard-wrapped string, which matches nothing at all (§R4.2). Nothing in the shared decorator or the
rules says which is intended, so each was written to taste.

**What it costs.** A client that learns `filter[name]=jane` performs a partial match on
`/settings/users` will get an empty page from `/settings/permissions` for a partial name, and always
an empty page from `/settings/roles`. The parameter is not portable across endpoints that look
identical in the documentation.

**What we should do.** Pick one — substring matching is the usual expectation for a `name` filter on
a list UI — apply it in all three repositories, and record it in `.claude/rules/repository.md` next to
the allow-list rules, which currently say what may be filtered but not how. Half a day including the
rule and the doc. Fold §R4.2's fix into this rather than doing them separately.

### §R4.6 `filter[role_id]` accepts one id and silently matches nothing for more — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/repositories/src/repositories/user.repository.ts:174-188`

**What this is.** `filter[role_id]` narrows the user list to holders of a given role, via an `EXISTS`
subquery on `user_roles`.

**Why this can happen.** The value is compared with `eq(user_roles_table.role_id, filter.role_id as
string)`. A caller passing a comma-separated list — the natural way to ask for "users in either of
these two roles", and the convention both Elysia siblings adopted — produces
`role_id = 'uuid-a,uuid-b'`, which matches no row.

**What it costs.** Filtering by two roles returns an empty page with a 200 rather than an error. Today
no client is known to do this and no documentation promises it, which is why this is latent rather
than a live bug — but it is the same shape as §R4.3: an unvalidated string cast with `as` and handed
to the database.

**What we should do.** Either split on commas and use `inArray`, matching what Tier 9 settled for
`clean-elysia`, or reject a value containing a comma with the same `BadRequestException` the key
check uses. Do not leave it silently wrong. Note `clean-nest-prisma-pg` already splits — its filter
key is `roles` and it handles a list (`user.repository.ts:123-141`) — so the two siblings disagree on
both the key name and the semantics.

---

## §R5 Queue and mail

### §R5.1 The verification email is enqueued inside the transaction that creates its token — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/auth/auth.service.ts:131-167` (`register`), `:271-287` (`forgotPassword`),
`libs/common/src/mail/mail.service.ts:16-19`, `.claude/rules/service.md` (the transaction example)

**What this is.** Registration writes the user row and a verification-token row in one database
transaction, then sends the mail. Mail is asynchronous: `MailService.sendMail` pushes a job onto the
`mail-queue` BullMQ queue in Redis, and `MailProcessor` — a separate consumer — sends it.

**Why this can happen.** The enqueue sits **inside** the `db.transaction` callback:

```ts
await db.transaction(async (tx) => {
    const newUser = await ... .insert(users_table) ... ;
    await tx.insert(email_verifications_table).values({ ... token, expired_at: ... });

    await this.mailService.sendMail({ ...verifyUrl with the token... });   // ← inside the tx
});
```

Redis and Postgres are separate systems with no shared transaction. The job is visible to the worker
the instant it is added, which is *before* the Postgres transaction commits. Two failure modes follow:

1. **The race.** The worker picks the job up, sends the mail, and the user clicks the link before the
   transaction commits. `verifyEmail` looks the token up, finds nothing, and reports an invalid
   token — for a link that was legitimately issued seconds earlier.
2. **The rollback.** If anything after the enqueue fails — the mail insert, a constraint, a
   connection drop — Postgres rolls back and the user row never exists, but the job is already in
   Redis and the mail goes out. The recipient gets a verification link for an account that was never
   created.

`forgotPassword` has the same shape at `:271-287`.

**What it costs.** Intermittent, unreproducible "invalid token" reports on freshly issued links, and
verification mail for accounts that do not exist. Both are the kind of failure that looks like a
user error and is nearly impossible to diagnose from a support ticket. The window is small but real,
and it widens exactly when the database is slow — the moment it is most likely to matter.

**The rules teach this pattern**, which is why it will keep coming back:
`.claude/rules/service.md` → "Transactions" shows `await this.mailService.sendMail({ ... })` inside
`db.transaction`, presented as the correct shape. The Prisma sibling's own rules say the opposite
("Do not enqueue inside a Prisma transaction. If the transaction rolls back the job stays in
Redis") — so the workspace already holds the right answer, in the wrong repo.

**What we should do.** Move the enqueue after the transaction: return the token from the transaction
callback and send once it has committed. Fix `.claude/rules/service.md`'s example in the same change —
leaving it would reintroduce this on the next feature. An hour including the rule. The same pattern
is in `clean-nest-prisma-pg`'s `register` (`auth.service.ts:116-142`), though **not** in its
`forgotPassword`, which correctly enqueues outside.

### §R5.2 A transient mail failure loses the message permanently and logs nothing — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/common/src/mail/mail.module.ts:45-52`, `libs/common/src/mail/mail.processor.ts:24-36`

**What this is.** `BullModule.registerQueue` configures the queue; `MailProcessor.process` sends each
job through nodemailer and logs a line naming the recipients.

**Why this can happen.** Two omissions:

- The queue is registered with a `connection` and nothing else — no `defaultJobOptions`, so no
  `attempts` and no `backoff`. BullMQ's default is a single attempt, so the first failure is the last.
- There is no `@OnWorkerEvent("failed")` handler. `process` lets errors propagate, which is correct,
  but nothing observes them — a failed job moves to the failed set silently.

**What it costs.** An SMTP hiccup, a rate limit from the mail provider, or a brief network fault
permanently drops a verification or password-reset email, with no retry and no error in the logs. The
user sees a registration that appears to succeed and an email that never arrives, and the operator
has nothing to correlate. Given §R1.1 already breaks verification, this would be the *next* problem
after that is fixed.

**What we should do.** Add `defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay:
2000 } }` to the queue registration, and an `@OnWorkerEvent("failed")` handler logging through
`LoggerUtils.error` with the job id and recipient. Both Elysia siblings' `queue.md` require exactly
this, and neither Nest repo has a queue rule at all — worth writing one. Under an hour including the
rule. Same gap in `clean-nest-prisma-pg`.

Two smaller notes in the same files, neither worth its own finding: the success log includes every
recipient address, so mail logs carry personal data into whatever aggregates them; and the Handlebars
template directory is resolved as `process.cwd() + "libs/common/src/mail/templates"`, a **source**
path, so any deployment that ships only `dist/` renders no mail at all. The latter is survivable only
because these repos deploy from a checkout via PM2 rather than from an image.

---

## §R6 Configuration and hygiene

### §R6.1 Two dead JWT secret fallbacks that read as live vulnerabilities — 🟠 latent risk — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `libs/utils/src/jwt/jwt.utils.ts:11-13`,
`libs/common/src/strategies/auth.strategy.ts:20`, `libs/config/src/env/index.ts:73-74`

**What this is.** `JWTUtils` signs and verifies tokens; `AuthStrategy` verifies the bearer token on
every authenticated request. Both read the signing secret from `getEnv()`.

**Why this can happen.** Both apply a hardcoded fallback:

```ts
private static readonly secret = getEnv().JWT_SECRET || "default-secret";
private static readonly refreshSecret = getEnv().JWT_REFRESH_SECRET || "default-refresh-secret";
secretOrKey: getEnv().JWT_SECRET || "default-secret",
```

The fallbacks are **unreachable**. `env/index.ts` declares `JWT_SECRET: str()` and
`JWT_REFRESH_SECRET: str()` with no defaults, so envalid exits the process at boot if either is
missing or empty. The application cannot start in a state where `|| "default-secret"` is taken.

**What it costs.** Nothing today — this fails safe. It is listed because of what it costs *later*: it
is one edit away from being critical. The moment anyone adds a default to the envalid schema, or
relaxes `str()` to `str({ default: "" })`, the application silently starts signing tokens with a
secret published in a public repository, and every token becomes forgeable — with no error and no log
line. That is precisely the `APP_JWT_SECRET` defect Tier 3 found in both Elysia repos, sitting here
pre-armed. It also misleads a reader into believing the secret is optional.

**What we should do.** Delete both fallbacks and read `getEnv().JWT_SECRET` directly — envalid is
already the guarantee, and the `||` only obscures it. Minutes. The sibling `clean-nest-prisma-pg`
already does exactly this (`jwt.utils.ts:11`, `auth.strategy.ts:22`, no fallback), so this is
straightforward drift and the Prisma version is the reference.

### §R6.2 A hardcoded English message in a service that translates everything else — 📄 doc / 🟠 — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `src/auth/auth.service.ts:261-268`

**What this is.** `.claude/rules/i18n.md` is unambiguous: "Never hardcode an English literal in a
controller, service, DTO, or repository." Every other throw in `AuthService` complies, using
`this.i18n.t("message.auth....")`.

**Why this can happen.** `forgotPassword`'s "not yet verified" branch was written with the literal
inline, in both the message and the field array:

```ts
throw new UnprocessableEntityException({
    message: "Please verify your email to proceed",
    error: { email: ["Please verify your email to proceed"] },
});
```

**What it costs.** A client sending `Accept-Language: id` receives Indonesian for every other error on
this endpoint and English for this one. The catalogue key it should use already exists and is already
used elsewhere in the same file — `message.auth.verify_email_required`, thrown at `:52-58`.

**What we should do.** Replace both literals with `this.i18n.t("message.auth.verify_email_required")`.
No catalogue change needed. Minutes. The sibling `clean-nest-prisma-pg` already uses that key at the
equivalent line (`auth.service.ts:242-249`), which confirms the intended wording.

### §R6.3 The service rule contradicts the i18n rule on exception messages — 📄 doc — CONFIRMED — ✅ RESOLVED 2026-08-23

**Where:** `.claude/rules/service-crud.md` (`getDetail`, `create`, `update`, `remove` examples),
`.claude/rules/service.md` ("Existence checks and errors" table), `.claude/rules/i18n.md`
("Service layer — inject `I18nService`")

**What this is.** Two rule files describe how a service reports a missing entity, and they disagree.

**Why this can happen.** `i18n.md` shows the compliant form and states the principle:

```ts
throw new NotFoundException(this.i18n.t("message.user.not_found", { args: { id } }));
```

`service-crud.md` and `service.md` both show a bare English template literal as the canonical shape —
`NotFoundException(\`User with ID ${id} not found\`)` — and `service.md` even specifies the format as
a requirement in its exception table.

**What it costs.** An agent or developer following `service-crud.md`, which is the file named for
exactly this task, writes untranslated exceptions and is technically compliant with the rule they
read. The contradiction is invisible unless both files are open. This is the class of defect the
workspace's item 8b exists to find, caught here incidentally.

**What we should do.** Rewrite the examples in `service-crud.md` and `service.md` to use
`this.i18n.t(...)`, and have both link to `i18n.md` as the authority on message strings. Then check
the settings services against it — those were not read in this pass (see Coverage), so whether the
code follows the wrong rule is currently unknown. Under an hour for the rules; the code check is part
of the next pass. The identical contradiction exists in `clean-nest-prisma-pg`'s rule set.

---

## Verified correct — checked, nothing found

Recorded so the next sweep can tell "clean" from "not looked at".

- **Soft delete on users is complete.** Every read path in `user.repository.ts` filters
  `isNull(users_table.deleted_at)` — `findAll` (`:128`), `getDetail` (`:337`), `UserInformation`
  (`:397`, `:441`), `findByEmail` (`:552`) — and `remove` stamps the timestamp (`:453`) rather than
  issuing a `DELETE`. `UserInformation` is the one that matters most, since `AuthStrategy` resolves
  the caller through it; a deleted user cannot authenticate.
- **Password hashes do not leak.** Every relational read passes an explicit `columns` block.
  `password: true` appears in exactly one place, `findByEmail` (`:558`), which is the login path and
  needs it.
- **Every guard string exists in the seed.** All ten `@PermissionAuth` values in `src/` —
  `user:{create,update,list,view,delete}` and `role:{create,list,view,update,delete}` — are produced
  by `permission.seed.ts`'s cross product of `["user","role","permission"]` and
  `["list","create","view","update","delete","restore"]`. No guard fails closed for a missing
  permission. (`restore` and the whole `permission:*` group are seeded but unused — harmless.)
- **The sort allow-list vocabulary is consistent.** `defaultSort` is `"createdAt"` and every
  `<entity>OrderableColumns` map is keyed camelCase, so the default matches. An unrecognised sort
  field or direction throws a translated `BadRequestException` rather than being coerced — the Tier 4
  defect from `clean-elysia` is not present here, and the code carries a comment explaining why.
- **Unexpected errors do not leak internals.** `ResponseHandler.handleError` logs the error through
  `LoggerUtils` and returns a generic translated 500 body; the raw error never reaches the client.
- **`/docs` is fail-closed.** `API_DOCS_ENABLED: bool({ default: false })`, checked in `main.ts:23`,
  with no `NODE_ENV` term beside it.
- **Rate limiting is genuinely global.** `ThrottlerGuard` is registered as an `APP_GUARD`, driven by
  `THROTTLER_TTL` / `THROTTLER_LIMIT`.
- **Mail templates exist for both locales** — `en/` and `id/` each carry `auth/verify-email.hbs` and
  `auth/forgot-password.hbs`, matching what `_localizedTemplate` resolves. The locale is captured at
  enqueue time, which is correct: the worker runs outside the request context.
- **CI is real.** `.github/workflows/build.yaml` runs against live Postgres and Redis services and
  checks that migrations match the schema, that the migration folder has no collisions, formatting,
  lint, typecheck, and build. It has no test step, which is honest — there are no tests. Deploy jobs
  are commented out.
- **Dependencies are current enough.** `bun outdated` shows nothing alarming: `@fastify/static`
  9→10, `bullmq` 5→6, `ioredis` 5→6, and `nodemailer` 8→9 are majors behind; everything else is
  within a patch or minor. No advisory-driven upgrade is indicated.

---

## §R2.5 Assigning permissions to a role has never worked — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

> **Found while verifying the §R2.3 fix, not during the sweep.** It is recorded here because it is a
> defect in its own right, and because it is the reason §R2.3 could not be verified at first: every
> attempt to revoke a role's permissions reported success and changed nothing.

**Where:** `libs/repositories/src/repositories/role.repository.ts:170` (`create`), `:267` (`update`),
`src/settings/roles/dto/create-role.dto.ts:25`, `src/settings/roles/roles.service.ts`

**What this is.** `POST /settings/roles` and `PATCH /settings/roles/:id` accept a role name and a list
of permission ids, and are the only way to manage what a role grants. The service validates that every
id exists, then hands the whole DTO to `RoleRepository().create(...)` / `.update(...)`, which writes
the `role_permissions` join rows.

**Why this can happen.** The DTO declares the field as `permissionIds`; the repository read
`roleData.permission_ids`. The two never matched, so the property was always `undefined` and the
entire permission block was skipped:

```ts
// repository — the field no caller ever sent
roleData: { name?: string; permission_ids?: string[] },
...
if (roleData.permission_ids) { /* delete + reinsert the join rows */ }
```

TypeScript did not catch it because `permission_ids` is **optional**, and excess-property checking
does not fire when an object is passed as a variable rather than an object literal. The DTO satisfied
the parameter type by having a `name`; its `permissionIds` was simply ignored. This is the same shape
as the `remarks` / `remark` lying type recorded against `clean-elysia` — a declared contract that does
not match what the caller sends, invisible to the compiler.

**What it costs.** Role permission management is entirely non-functional, and it fails **silently with
a success response**:

- `POST /settings/roles` with two permission ids returns **201** and writes **zero** join rows. The
  new role grants nothing.
- `PATCH /settings/roles/:id` returns **200** and changes nothing — so an administrator cannot grant a
  permission, cannot revoke one, and cannot strip a role back to nothing. The UI shows the change
  they made; the database does not have it.

The application appears to work only because `libs/repositories/src/seed/role.seed.ts` writes
`role_permissions` directly, bypassing this path entirely. Every working permission grant in a running
system came from the seeder.

**Verified by running it, before the fix:**

```
POST /settings/roles  {name, permissionIds: [2 ids]}  -> 201, role_permissions rows = 0
PATCH /settings/roles/:id {permissionIds: [2 ids]}    -> 200, role_permissions rows = 0
```

**What we should do — done.** The repository's input field was renamed to `permissionIds` to match the
DTO, keeping the `permission_id` **column** name untouched. Re-verified live: creating with 2 ids
writes 2 rows, updating to 5 writes 5, and updating to `[]` correctly revokes all of them. The sibling
`clean-nest-prisma-pg` builds these rows in the service from `createRoleDto.permissionIds` directly and
is **not** affected.

## §R2.6 The Redis cache was never used — every process held its own in-memory copy — 🔴 bug — CONFIRMED — ✅ RESOLVED 2026-08-23

> **Also found while verifying §R2.3**, by checking Redis for the key the fix was supposed to be
> deleting and finding that no such key had ever existed.

**Where:** `libs/common/src/cache/cache.module.ts`, `package.json`
(`cache-manager@^7`, `@nestjs/cache-manager@^3`, `cache-manager-ioredis-yet@^2`)

**What this is.** `CacheModule` configures the store that backs `CacheService`, which is what
`AuthStrategy` uses to avoid rebuilding every caller's roles and permissions from Postgres on each
request. It was written to use Redis, and `cache-manager-ioredis-yet` is a declared dependency.

**Why this can happen.** The configuration used the cache-manager v4/v5 shape:

```ts
useFactory: () => ({
	store: redisStore,
	host: getEnv().REDIS_HOST,
	port: Number(getEnv().REDIS_PORT),
	ttl: (Number(getEnv().REDIS_TTL) || 3600) * 1000,
}),
```

cache-manager v7 is Keyv-based and takes a `stores` array. The `store` / `host` / `port` keys are not
rejected — they are silently ignored — so the module fell through to the default in-process memory
store. Nothing was ever written to Redis, and no error was raised at boot or at runtime.

**What it costs.** Two things, and the second is the serious one:

- The declared Redis dependency did nothing, and the cache did not survive a restart.
- **Under PM2 the cache was per-worker.** `ecosystem.config.js` runs `instances: "max"` in cluster
  mode, so each worker held its own independent copy of every user's roles and permissions. That
  makes the §R2.3 invalidation fix incomplete in exactly the environment it matters: deleting the
  cached identity clears it on the one worker that served the request, while the other workers keep
  serving the revoked role until their own copy expires.

The reason this went unnoticed is that Redis *is* up and busy — BullMQ uses it — so "Redis is
connected" was true and misleading.

**Verified by running it.** Before: `redis-cli --scan` returned only `bull:*` keys, and
`TTL user:<id>` returned `-2` (no such key). After: `user:<id>` is present with a TTL of `3600`, and
revoking a role's permissions still takes effect on the very next request.

**What we should do — done.** `CacheModule` now builds a `Keyv` instance over `@keyv/redis` and
passes it in `stores`, with `useKeyPrefix: false` so the key is the plain `user:<id>` that
`UserCache()` produces. `@keyv/redis` was added as a dependency. Two follow-ups deliberately **not**
taken, and left for a decision:

- `cache-manager-ioredis-yet` is now unused and could be removed. It was left in place because
  removing a dependency is a separate change with its own lockfile churn.
- Nothing yet proves the cross-worker behaviour under an actual multi-instance PM2 run — this was
  verified against a single process. A cluster-mode check belongs in the next pass.

---

# Sweep 3 — code read, pass 2 (2026-08-23)

**Scope:** the surfaces the Coverage block of sweep 2 listed as *not reached* — the settings
services, all DTOs, the validation pipes, `libs/utils`, the i18n catalogues, and the seeders'
relationship to the permission vocabulary.
**Ground truth:** `CLAUDE.md`, `.claude/rules/*.md`, and the running code.

**Severity legend:** 🔴 bug · 🟠 inconsistency / latent risk · 🟡 hygiene · 📄 doc
**Evidence:** CONFIRMED (traced end to end) · SUSPECT (something unverified, named below)

> **Read-only. Nothing below has been fixed.** Findings use a `§P` prefix so they never collide with
> the `§R` sweep above.

**Still not reached, after two passes:** the settings controllers' Swagger decorator blocks beyond a
spot-check, `libs/utils/src/{date,string,number,logger}` (~750 lines of helpers), the Drizzle schema
files and migrations, and the `api-response` / `api-datatable-queries` decorators.

## §P1 A permission created through the API can never satisfy a guard — 🔴 bug — CONFIRMED

**Where:** `libs/repositories/src/repositories/permission.repository.ts:153-155` (`create`),
`src/settings/permissions/permissions.service.ts:58` (`update`),
`libs/repositories/src/seed/permission.seed.ts:16` (the convention)

**What this is.** A permission's `name` is the string `@PermissionAuth(...)` matches against. The
seeder builds the whole catalogue as `` `${group}:${action}` `` — `user:list`, `role:create` — and
every guard in `src/` is written in that vocabulary. `POST /settings/permissions` exists so an
operator can extend the catalogue without editing the seeder.

**Why this can happen.** Both write paths compose the two halves in the **opposite order**:

```ts
// seeder — the convention every guard uses
name: `${group}:${action}`          // -> "user:list"

// repository create — reversed
name: `${name}:${permissionData.group}`   // -> "list:user"

// service update — reversed the same way
name: `${updatePermissionDto.name}:${updatePermissionDto.group}`
```

They are consistent with each other and backwards relative to the seeder, so nothing looks wrong
inside the permissions module itself.

**What it costs.** Every permission created through the API is unusable. An operator adding a
`report:export` permission posts `{ names: ["export"], group: "report" }` and gets a row named
`export:report`; a route guarded `@PermissionAuth("report:export")` will never match it, and — per
the seeder invariant already recorded in `contradiction-halt.md` — that route then fails **closed**
for everyone except `superuser`, with nothing logged. `update` makes it worse: renaming an existing,
working permission rewrites it into the reversed form, silently breaking every route that referenced
it.

**Verified by running it.** `POST /settings/permissions {names:["export"], group:"report"}` stored
`export:report`. The seeded convention would be `report:export`.

**What we should do.** Compose `` `${group}:${action}` `` in both write paths, matching the seeder,
and rename the DTO field so it says what it holds — `names` are *actions*, not full permission names,
which is the ambiguity that allowed the inversion. The `@ApiProperty` example
(`["create_user", "delete_user"]`) is in neither format and should be corrected with it. Under an
hour; the risk is entirely in existing rows, so decide whether to migrate any API-created permissions
before changing the composition. **The sibling `clean-nest-prisma-pg` has the identical inversion**
(`permissions.service.ts:17`).

## §P2 One `sendMail` is still enqueued inside its transaction — 🟠 latent risk — CONFIRMED

**Where:** `src/settings/users/users.service.ts:77` (inside the `db.transaction` opened at `:47`)

**What this is.** §R5.1 established that enqueuing a BullMQ job inside a database transaction lets
the worker send a verification link whose token row is not committed yet, or send one at all for a
write that rolled back.

**Why this can happen.** The §R5.1 fix corrected all three sites in `src/auth/auth.service.ts` and
**missed this one** — an administrator creating a user through `POST /settings/users` follows the
same write-token-then-mail shape, in a different file. A sweep of every `sendMail` call site against
its enclosing block finds exactly one remaining in each repo, both in `users.service.create`.

**What it costs.** The same race and the same rollback window as §R5.1, on the admin-driven user
creation path rather than self-registration. Narrower exposure, identical mechanism.

**What we should do.** Return the token from the transaction callback and enqueue after it commits,
exactly as `auth.service.ts` now does. Minutes. This is a gap in the earlier fix, not a new class of
defect — worth noting that the fix was verified end-to-end on the auth flow and that verification
simply did not cover this route.

## §P3 `EncryptionUtils` is unused, and would be a poor choice if it were used — 🟠 latent risk — CONFIRMED

**Where:** `libs/utils/src/encryption/encryption.utils.ts`

**What this is.** A four-method AES wrapper over `crypto-js`, keyed on `APP_SECRET`, exported from
`@utils` alongside `HashUtils` and `JWTUtils`.

**Why this can happen.** It has **zero call sites** in `src/` or `libs/` in either repo — it ships as
part of the template rather than in response to a need. Two properties make it a trap for the first
person who reaches for it: `CryptoJS.AES.encrypt(text, passphraseString)` derives its key with
OpenSSL's `EVP_BytesToKey` (MD5, one iteration, no configurable work factor), and the default mode is
CBC with no authentication tag, so ciphertext is malleable and tampering is undetectable. `crypto-js`
itself was archived by its maintainer in favour of the platform `crypto` API.

**What it costs.** Nothing today. The cost is that it looks like the house-approved way to encrypt
something, sits behind the same `@utils` import as the correctly-built `HashUtils`, and carries the
two `eslint-disable` lines that suggest it was fought with rather than reviewed.

**What we should do.** Either delete it — it is dead — or replace the internals with
`node:crypto` AES-256-GCM and a proper KDF, and say in a comment what it is for. Deleting is the
honest default for a template: nothing needs it, and a future need is better served by writing the
thing the need actually calls for. Half an hour either way.

## §P4 Services reach past the repository into the database — 🟠 inconsistency — CONFIRMED

**Where:** `src/settings/users/users.service.ts:89-94` (`resendVerificationEmail`),
`src/settings/permissions/permissions.service.ts:45-47` and `:66-68`

**What this is.** `.claude/rules/nestjs.md` and `repository.md` both state the layering: controllers
delegate to services, services call repositories, repositories own the queries. Every other method in
these two services follows it.

**Why this can happen.** Three methods build queries inline instead —
`UserRepository().getDb().query.users.findFirst(...)` in one case, bare
`db.query.permissions.findFirst(...)` in the other two. `getDb()` is the escape hatch that makes the
first one possible while still looking like repository usage.

**What it costs.** No wrong behaviour today. The cost is that the soft-delete filter, the column
selection, and the "what does a miss return" convention are now decided in two places. The
`permissions` reads happen to be correct; the `users` one duplicates a `deleted_at` filter that
`UserRepository` already owns — and the next person to change that filter will change it in one
place.

**What we should do.** Add the two missing lookups to their repositories (`findForVerification(id)`,
`PermissionRepository().findById(id)`) and call those. Under an hour. Worth doing when §P1 is fixed,
since it touches the same permissions service.

## §P5 A DTO imports the schema by relative path, bypassing the alias — 🟡 hygiene — CONFIRMED

**Where:** `src/settings/users/dto/create-user.dto.ts:2-5`

**What this is.** `imports-and-naming.md` and `shared-code.md` both require the `@repositories` alias
for cross-layer imports and explicitly forbid `../../libs/...`.

**Why this can happen.** The DTO reaches four levels up:
`"../../../../libs/repositories/src/schema/user.schema"`. It resolves, so nothing complains.

**What it costs.** It breaks the moment the file moves, and it bypasses the barrel — so a symbol that
is deliberately *not* re-exported from `@repositories` can still be imported, which is the thing the
barrel exists to control.

**What we should do.** `import { UserStatusEnum, UserStatusEnumArray } from "@repositories";`.
One line. Worth grepping for other relative climbs at the same time — this is the only one.

## §P6 The status field documents its example as the whole enum — 🟡 hygiene / 📄 doc — CONFIRMED

**Where:** `src/settings/users/dto/create-user.dto.ts:52-56`

**What this is.** `@ApiProperty({ example, enum })` drives what `/docs` shows for a field.

**Why this can happen.** `example: UserStatusEnumArray` passes the **array** as the example for a
field that takes one value, so Scalar renders `["active","inactive","suspended","blocked"]` as the
sample request value. `enum: UserStatusEnumArray` beside it is correct.

**What it costs.** Anyone using the "try it" panel sends an array and gets a 422. Cosmetic, but it is
the first thing a consumer of this endpoint sees.

**What we should do.** `example: "active"`. One word.

## §P7 Creating a duplicate permission returns 500 rather than 422 — 🟠 latent risk — CONFIRMED

**Where:** `libs/repositories/src/repositories/permission.repository.ts:158`,
`src/settings/permissions/permissions.service.ts:18-22`

**What this is.** `permissions.name` carries a unique constraint — the seeder relies on it, using
`onConflictDoNothing`.

**Why this can happen.** The API create path has neither a uniqueness check in the service nor a
conflict clause on the insert. A repeated name raises a raw Postgres constraint violation, which
`ResponseHandler.handleError` does not recognise and returns as a generic 500.

**What it costs.** An operator creating a permission that already exists gets "Internal Server Error"
instead of a field-mapped 422 — and `CLAUDE.md` states uniqueness failures are 422 in this codebase.
It is also noise in error monitoring for an ordinary user mistake.

**What we should do.** Check the names first in the service and throw
`UnprocessableEntityException` with a field map, matching every other uniqueness check in the tree.
Under an hour. The sibling `clean-nest-prisma-pg` uses `skipDuplicates: true`, which avoids the 500
but silently succeeds without creating anything — arguably worse, and worth deciding together.

## §P8 The verification-token lifetime is inlined next to the helper that exists for it — 🟠 inconsistency — CONFIRMED

**Where:** `src/settings/users/users.service.ts:73` against `:113`

**What this is.** `libs/utils/src/default/token-lifetime.ts` exports `emailVerificationLifetime()` as
a **function** specifically so the expiry is computed per token rather than frozen at module load —
a defect this workspace has already fixed once, in `clean-elysia`.

**Why this can happen.** `create` writes `expired_at: DateUtils.addHours(DateUtils.now(), 2).toDate()`
inline; `resendVerificationEmail`, forty lines below in the same file, correctly calls
`emailVerificationLifetime()`. Both currently produce two hours.

**What it costs.** Nothing today — the values agree. The moment the lifetime changes in
`token-lifetime.ts`, tokens minted by admin user-creation keep the old window and tokens from the
resend path get the new one, with no error anywhere.

**What we should do.** Call `emailVerificationLifetime()` in both. One line.

## §P9 One uniqueness message is a hardcoded English literal — 📄 doc / 🟠 — CONFIRMED

**Where:** `src/settings/users/users.service.ts:157-161`

**What this is.** `i18n.md` is unambiguous: never hardcode a user-facing literal in a service. The
`create` method twelve lines above correctly uses `this.i18n.t("message.user.email_exists")`.

**Why this can happen.** `update`'s duplicate-email branch was written with the literal inline, in
both the message and the field array.

**What it costs.** A client sending `Accept-Language: id` gets Indonesian for every other error on
this endpoint and English for this one. The key it needs already exists and is already used in the
same file.

**What we should do.** Replace both with `this.i18n.t("message.user.email_exists")`. Minutes. This is
the same shape as §R6.2, which was found and fixed in `auth.service.ts` — this is the settings-layer
instance the earlier sweep did not reach.

---

## Verified correct — checked, nothing found

- **The i18n catalogues are in exact parity.** `message.json` 60/60, `validation.json` 7/7,
  `email.json` 2/2 between `en` and `id`, with no key present in one and missing from the other. A
  reverse check — every `t("...")` and `i18nValidationMessage("...")` in `src/` and `libs/` resolved
  against the catalogue — found **no missing key**, so no raw key string can reach a client. Six
  catalogue entries are unused, which is harmless.
- **`CustomValidationPipe` is solid.** `whitelist` and `forbidNonWhitelisted` are both on, so unknown
  properties are stripped and rejected rather than passed through; `transform` with implicit
  conversion is enabled; the `key|{args}` encoding from `i18nValidationMessage` is decoded and
  translated with the field name injected as both `property` and `field`; nested errors are flattened
  with dotted paths. Nothing to change.
- **Every DTO decorator carries an i18n message.** No class-validator constraint in any of the nine
  DTOs falls back to the library's own English string.
- **The privilege-granting route is gated correctly.** `PATCH /settings/users/:id/password` is
  `@RoleAuth("superuser")`, not a permission — matching the convention in `rbac`-equivalent rules and
  both Elysia siblings.
- **`HashUtils` is correct.** bcrypt with a cost of 10 — defensible today; 12 would be the current
  default if it is ever revisited, but this is not a finding.

## §P11 DTO validation failures return a different envelope from every other error — 🟠 inconsistency — CONFIRMED

> Found while writing `docs/API_DOCUMENTATION.md` (item 12b) — the guide could not describe "the
> error envelope" truthfully, because there are two.

**Where:** `libs/common/src/pipes/custom-validation/custom-validation.pipe.ts:26-41`,
`libs/common/src/response/response.ts:15-22` (`ErrorResponse`), and the `try/catch` in every
controller method

**What this is.** The house envelope is built by `ResponseHandler`: `{ code, success, message, data }`,
with `errors` under the key `error` for field-mapped failures. Controllers call
`ResponseHandler.handleError(res, error)` from a `catch` block, which is what applies it.

**Why this can happen.** A global `ValidationPipe` runs **before** the controller method is entered,
so an exception it throws never reaches that `try/catch` — Nest's default exception filter serialises
the payload verbatim instead. The pipe's `exceptionFactory` builds
`{ statusCode: 422, message, data: null, error }`, which is close to the house shape but not it: the
key is `statusCode`, not `code`, and there is **no `success` field at all**.

The pipe's own block comment asserts the opposite — "emits the project's 422 envelope, which
ResponseHandler already understands" — which is how this survived: the intent is stated, and the
mechanism that would carry it out is bypassed.

**What it costs.** A client that branches on `success` gets `undefined` for every DTO validation
failure — the single most common error an API returns — and one that reads `code` gets `undefined`
too. Both work correctly for every other status, including 422s thrown by a service.

**Verified by running it.** Two 422s from the same server:

```jsonc
// DTO validation (pipe, bypasses ResponseHandler)
{ "statusCode": 422, "message": "property password_confirmation should not exist",
  "data": null, "error": { ... } }

// business rule (service -> handleError)
{ "code": 422, "success": false, "message": "Invalid email or password",
  "data": null, "error": { ... } }
```

**What we should do.** Make the pipe's factory emit `code` and `success` so both paths agree — a
three-line change in `exceptionFactory`, and it is the safer direction because the house envelope is
what every other response already uses. Alternatively register a global exception filter that applies
`ResponseHandler` to everything, which fixes this class of problem rather than this instance, but is
a larger change with more surface. Either way, correct the pipe's comment: it currently documents
behaviour the code does not have. Under an hour.

**Every allow-listed filter key is implemented.** Checked mechanically — each list repository's
exported `<entity>FilterableFields` array against the keys its `where` builder actually reads:
`user` (`status`, `name`, `email`, `role_id`), `role` (`name`), and `permission` (`name`, `group`)
all match exactly. The sibling `clean-nest-prisma-pg` fails this check on its permission endpoint
(its §P12), where three allow-listed keys have no branch and silently return an unfiltered page.
Worth re-running this diff whenever a filter key is added.
