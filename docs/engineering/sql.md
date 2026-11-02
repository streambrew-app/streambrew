# StreamBrew SQL Guide

Follow this guide for `db/*.sql` and SQL embedded in Go or TypeScript. The naming and layout rules apply to both languages; language-specific rules are called out below.

Run `just fmt-sql` to format migrations and `db/schema.sql` with sqruff. Run
`just fmt-check-sql` to check all SQL files after generating a new schema dump.
The repository-wide `just fmt` and `just fmt-check` recipes include these checks.
Formatting removes SQL comments except for dbmate's required `migrate:up` and
`migrate:down` directives.

## Migrations

Production applies new migrations automatically when a release deploys, before
new containers start and while the previous revision keeps serving. A migration
must therefore work with both the revision in production and the revision that
adds it. One release can contain several PRs, so production may run a revision
several PRs behind `main`. Split incompatible changes across PRs
(expand/contract):

1. Expand: add new tables, nullable columns, columns with defaults, enum values,
   or functions without changing what existing code relies on.
2. Migrate code: deploy code that writes and reads the new shape, and backfill
   existing rows when needed.
3. Contract: once no deployed revision uses the old shape, drop or tighten it in
   a later PR. Merge the contract PR only after a release has deployed the
   expand and code changes it depends on.

Do not rename or drop a column, table, or enum value, add `NOT NULL` without a
default, or change a function's contract in the same release as the code that
stops using it. Keep each migration short-running, because it holds locks while
the application serves traffic. Rolling back the application does not reverse
migrations, so the expanded schema must also work with the previous revision.

## Naming and syntax

- Write SQL keywords in uppercase and built-in types in lowercase. Use lowercase `snake_case` for tables, columns, constraints, functions, and CTEs; SQL function calls are lowercase.
- Use singular table names and `<entity>_id` primary keys. Quote identifiers only where PostgreSQL requires it or for externally prescribed names such as `"user"` and Better Auth's `"userId"`.
- End standalone `.sql` statements with a semicolon; never add one inside a tagged SQL template.
- Prefer `SELECT *` when the full, unambiguous row is required without unnecessary transfer. Otherwise select the intended shape.

## Layout

- Put major clauses on their own lines: `SELECT`, `FROM`, `WHERE`, `ORDER BY`, `INSERT INTO`, `VALUES`, `ON CONFLICT`, and `UPDATE`. Keep short `RETURNING` expressions inline.
- Keep short column lists on one line; for long lists, wrap after `(` and indent continuation lines by two spaces. Use one definition or assignment per line when needed, with trailing commas except on the final line.
- Put each `JOIN` on a new line, indent `ON` conditions two spaces, and align continuing `AND`/`OR` conditions.
- For schemas, declare domains and enums before use, order tables by dependency, align column types and constraints, and name indexes `<table>_<purpose>_idx`. Use `--` for sections and format PL/pgSQL control flow in uppercase with two-space bodies.

## TypeScript queries

- Use `postgres` tagged templates (`sql\`...\``) and interpolate values with `${value}`. Never assemble values into a SQL string or use `sql.unsafe` unless every dynamic fragment is application-controlled and values use its parameter array.
- Order selected expressions: direct unaliased columns, casts, functions, `CASE`, JSON construction, then aliases. Qualify columns in joins or other ambiguous sources; use `USING (column)` for same-named join keys.
- For batch inserts, use `WITH input AS (...)` with `jsonb_to_recordset`, explicitly listing the input record's columns and types.
- Use `jsonb_build_object` only for a genuinely structured domain return. Keep flat fields as columns and validate returned JSON with Zod. Format JSON builders with more than four pairs across lines, one pair per line, aligned values.
- Specify `INSERT` target columns when defaults, generated, or omitted columns exist; prefer them for all `INSERT ... SELECT` statements. Put `INSERT INTO`, its target list, `SELECT`, and `FROM` on separate lines; follow the source with `ON CONFLICT`, then `RETURNING`.
- For multi-column `UPDATE`, start assignments below `SET`, one per line, then put `FROM`, `WHERE`, and `RETURNING` on separate lines.
