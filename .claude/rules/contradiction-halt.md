# Contradiction Halt Rule

## Principle: the request can be wrong — surface it, don't silently "fix" it

The user (or a task, plan, or ticket) may ask for something that contradicts these rules, the
established architecture, or that would introduce a bug. **The user may be wrong, and that is
expected.** When you detect such a contradiction, **stop and tell the user, and do nothing else about
it** until they decide.

This applies whether the contradiction is with:

- a rule in `.claude/rules/*.md` or `CLAUDE.md`,
- the documented architecture or an existing pattern in the codebase,
- a latent bug the requested change would create or depend on, or
- a security / access-control invariant — guard coverage, `@PermissionAuth` gating, the soft-delete
  `isNull(<table>.deleted_at)` filter, password hashing, token lifetimes, sort/filter allow-listing.

## What "do nothing" means

- **Do not implement the contradicting change**, not even a best-guess partial version.
- **Do not silently work around it** or quietly pick a different approach without saying so.
- **Do not fix the contradicting bug on your own initiative** as part of an unrelated task — report
  it and wait.

## What to do instead

1. State the contradiction plainly: what was requested, which rule / pattern / invariant it conflicts
   with (cite the rule file or `file:line`), and the concrete consequence — bug, data leak, broken
   contract, inconsistency.
2. If you have a compliant alternative, offer it as a recommendation — but still let the user choose.
3. Proceed once the user confirms. If they confirm the original request knowing the trade-off, that
   is their call to make, and you implement it in full.

## Scope

- This is a **halt-and-report** rule, not permission to refuse work. Once the user acknowledges the
  contradiction and decides, follow their decision.
- It does **not** apply to trivial style nits you can just conform to — match the surrounding code
  and move on. It applies to genuine contradictions with rules, architecture, security, or
  correctness.
- It does not license scope creep in the other direction either: noticing an unrelated defect means
  *reporting* it, not fixing it inside the current change.

## Known contradictions already on record

These are documented in their rules and awaiting a decision. Do not build on any of them without
raising it first:

- `CustomValidationPipe` emits the 422 field map as `errors` while Swagger and hand-thrown 422s use
  `error` — `response-codes.md`.
- `POST /users/:id/resend-verify-email` is authenticated but not permission-gated, and
  `AuthController` has no `@ApiTags` — `routes.md`.
- **`defaultSort` never matches any sort allow-list.** `libs/utils/src/default/sort.ts` exports
  `defaultSort = "createdAt"` (camelCase), but every `findAll` allow-list keys its sortable columns
  in snake_case (`created_at`, `updated_at`). The requested sort falls through to the `"id"` fallback,
  so every unsorted list is ordered by id while the code reads as if it sorts by creation date —
  `response-codes.md`.
- **Invalid sort fields and unknown filters are silently ignored**, not rejected: the allow-list falls
  back to `id` and `FilterValidationPipe` drops unrecognised `filter[...]` keys, so a malformed query
  returns a successful 200 over the wrong rows — `response-codes.md`.
- **Token lifetimes are computed once at module load.** `libs/utils/src/default/token-lifetime.ts`
  evaluates `DateUtils.addHours(DateUtils.now(), 2).toDate()` at import time, so
  `emailVerificationLifetime` and `resetPasswordLifetime` are frozen at process start rather than
  computed per token. Every token issued during a long-lived process shares one absolute expiry that
  drifts further into the past as the process runs. These want to be functions, not constants.
- **`ThrottlerModule` re-exports itself** and carries `|| 60` / `|| 100` fallbacks that disagree with
  the envalid defaults — `rate-limiting.md`.
- **There is no seeder.** `make db-seed` runs `bun run seed`, but no `seed` script and no seed files
  exist, so the target has never worked and the RBAC permission catalog has no ground truth —
  `routes.md`. `make db-reset` is likewise advertised in `make help` and `.PHONY` with no target
  defined.
