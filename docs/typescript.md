# TypeScript conventions

Read this guide before changing TypeScript or TSX in any workspace package,
including `apps/web` and `packages`. Shared engineering conventions live in
[contribution guide](contributing.md#shared-engineering-conventions).

## Local skills

<!-- intent-skills:start -->

Before editing TS and TSX files for a substantial task:

- Run `bun intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bun intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

## Code and contracts

- Avoid mutating objects.
- For HTTP requests, subscriptions, streams, workers, or other external failures,
  follow the [error-handling guide](errors.md).
- For Zod schemas, follow the [Zod guide](zod.md).
- For SQL embedded in TypeScript, follow the [SQL guide](sql.md).
- For localized copy, locale handling, or locale-sensitive formatting, follow
  the [internationalization guide](i18n.md).

Web-specific rules and document links live in
[apps/web/AGENTS.md](../apps/web/AGENTS.md).
