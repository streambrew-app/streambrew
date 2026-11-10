# Contributing to StreamBrew

Read this guide before changing code. Research, investigation, review, planning,
and other read-only tasks do not require a GitHub issue unless they also change
code. Documentation may be updated alongside the behavior it describes.

## Issue and branch

1. Base code changes on an open issue in this repository. Reuse a suitable open
   issue, or create one explaining the reason and motivation before editing code.
   Create a new issue for follow-up work instead of reopening a closed issue.
2. Start a new implementation from the current `main` with successful required
   checks, on a task branch. Never change code directly on `main`.
   When continuing an existing task branch or PR, retain its work and issue;
   update it from `main` when integration or conflicts require it.
3. If `main` is broken or required checks fail, repair it through a single
   `fix-main` PR before relying on `main`; see [Repairing main](#repairing-main).
   For an ongoing PR, distinguish failures introduced by the branch from failures
   that `main` already has. Fix the former in the branch; never fix a broken
   `main` inside an unrelated PR.

## Implementation and review

1. Work in small, coherent increments. Commit each step with a clear message and
   its relevant documentation; keep the uncommitted diff small.
2. Create a PR targeting `main` and include `Closes #<issue-number>` in its
   description. Use the PR as the unit a human can inspect and redirect.
3. Run relevant builds, tests, and required CI checks. Resolve conflicts and
   failures introduced by the change, then verify again. Report pre-existing
   failures or unavailable checks explicitly; do not describe them as passing.
4. Hand a green, review-ready PR to the human for review, approval, and merge.
   The merge authorization boundary is defined in [AGENTS.md](../AGENTS.md#working-agreements).
   Merging is cheap: the merge queue tests the PR against the latest `main`, and
   production deploys only from a published release, as described in the
   [deployment guide](operations/deployment.md#deployments-and-migrations).
   Recover from a bad release with a rollback and a fix-forward PR as described in
   the [deployment guide](operations/deployment.md#rollback). A PR does not need to
   be up to date with `main`; enable auto-merge to add it to the queue once checks
   pass.
   A migration must stay compatible with the revision in production; see
   [migrations](engineering/sql.md#migrations).
5. Turn recurring review findings into automated repository checks when practical.

Green CI establishes automated correctness only. Follow the decision and approval
boundaries in [AGENTS.md](../AGENTS.md#working-agreements) for product and architecture
choices.

## Repairing main

Besides the merge queue, the owner's Raspberry Pi dispatches CI on `main` every
30 minutes. When that run fails, the Pi reruns the failed jobs once and starts a
repair agent only if they fail again, outside setup steps, so transient
infrastructure failures do not start a repair. A failed run on the latest `main`
commit means `main` is broken. At most one open PR labelled `fix-main` repairs it
at a time:

1. Check for an open `fix-main` PR. If one exists, do not start another repair;
   wait for it to merge, then update your branch from `main`.
2. Otherwise, create a `fix-main` issue and a PR from `main` with the `fix-main`
   label, then continue your own task once the repair merges.
3. Prefer reverting the commit that broke `main`; fix forward only when the fix is
   small and evident. Never skip, delete, or weaken tests or checks to make `main`
   green.
4. Enable auto-merge on the `fix-main` PR. This is the one exception to the
   [merge authorization boundary](../AGENTS.md#working-agreements): it needs no
   explicit merge request.

## Shared engineering conventions

- Normalize untrusted input once at its seam into a canonical domain value.
  Downstream code compares, stores, and keys that canonical value.
- Treat a module's public interface as its test surface. Do not widen a public
  API or add dependency injection solely for tests.
- Prefer removing legacy code and compatibility paths, subject to the explicit
  user authorization required by the root working agreements.
- Use tRPC for client-server interactions. A Go service may implement a tRPC wire
  contract; keep its TypeScript contract and Go implementation synchronized.
- Add helper commands to `justfile`, not `package.json`. The root working
  agreements govern changes to files in `scripts/`.
- Before changing a Go service, read the relevant domain guides linked from the
  root, including the multichat guide for chat work and the SQL guide for SQL.
- Keep referenced documentation current when changing behavior or conventions.
- When instructions require visiting a third-party service, link to the exact
  external page at the point of instruction, including in product setup flows.

## Validation

Use repository-wide `just` recipes for checks; they cover the TypeScript workspace,
Go service entrypoints, and application packages under `internal`.
The [root command list](../AGENTS.md#verification) describes the main checks.
For documentation-only changes, check Markdown formatting, relative links and
anchors, and the coverage of moved instructions. Application tests are not needed
locally for prose-only edits; required PR checks still apply.

Development prerequisites and local setup are in [README.md](../README.md#start-locally).
The schema and migration authorization boundaries in the root also apply to
commands shown in setup guides.
