# Skills

Engineering skills available to Claude Code in this repo.

`.claude/skills` is a **symlink** to this directory (`.agents/skills/`), so the same bundle is
visible to any agent that reads either path. Do not replace the symlink with a real directory — the
two would drift.

Most skills here are installed from upstream repositories by the [`skills`](https://github.com/vercel-labs/skills)
CLI and recorded in `skills-lock.json` at the repo root:

```bash
bunx skills list                    # show what is installed
bunx skills add <owner>/<repo>      # install a skill package
bunx skills update                  # pull upstream changes
bunx skills experimental_install    # restore everything from skills-lock.json
```

## Installed skills

### Workflow and process

| Skill | Use it for |
| --- | --- |
| `brainstorming` | Explore intent, requirements, and design before any implementation work |
| `writing-plans` | Turn a feature request into a reviewable, step-by-step plan |
| `executing-plans` | Work through an approved plan one step at a time |
| `test-driven-development` | Write the failing Jest spec first, implement to green, then refactor |
| `systematic-debugging` | Reproduce, isolate, hypothesise, verify — instead of guessing |
| `requesting-code-review` / `receiving-code-review` | Ask for and act on a review of a diff |
| `verification-before-completion` | Confirm the work actually runs before calling it done |
| `finishing-a-development-branch` | Wrap up, clean up, and land a branch |
| `using-git-worktrees` | Run parallel work trees without stepping on the main checkout |
| `dispatching-parallel-agents` / `subagent-driven-development` | Fan work out to subagents, then integrate |
| `handoff` | Compact the current session into a handoff document for the next agent |
| `writing-skills` | Author a new skill correctly |
| `using-superpowers` / `find-skills` | Discover and pull in skills that are not installed yet |

### Engineering craft

| Skill | Use it for |
| --- | --- |
| `nestjs-best-practices` | DI, module boundaries, guards/pipes/interceptors, Fastify-adapter specifics |
| `clean-code` | Turn "code that works" into code that reads well — naming, functions, structure |
| `typescript-advanced-types` | Generics, conditional and mapped types, discriminated unions |
| `typescript-pro` | Custom type guards, utility types, branded types, end-to-end type safety |
| `postgres` | PostgreSQL best practices, query optimisation, connection troubleshooting |
| `postgresql-optimization` | PostgreSQL-specific features — JSONB, arrays, ranges, full-text search, extensions |
| `caveman` | Ultra-compressed output mode when token efficiency is explicitly requested |

## Relationship to `.claude/rules/`

Skills are **general** engineering technique. The path-scoped standards that are specific to *this*
codebase — layering, response handling, RBAC gating, DTO shape, repository factories — live in
`.claude/rules/` and take precedence wherever the two overlap. Read the relevant rule before writing
code; reach for a skill for the technique.

## Adding a skill

Prefer installing from upstream so `skills-lock.json` can restore it:

```bash
bunx skills add <owner>/<repo> -s <skill-name>
```

To author a repo-local one, create `<skill-name>/SKILL.md` here:

```markdown
---
name: <skill-name>
description: <one line — when this skill should trigger>
---

# <Skill Name>

<instructions / checklist / examples>
```

> **Note:** `caveman`, `clean-code`, `handoff`, `postgres`, `postgresql-optimization`, and
> `typescript-pro` were vendored in by hand rather than installed through the CLI, so they have no
> `skills-lock.json` entry and `bunx skills update` will not touch them. Re-add them through
> `bunx skills add` once the upstream source for each is confirmed.
