import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

const repositoryRoot = fileURLToPath(import.meta.resolve("../../../"));
const allowedRootMarkdownFiles = ["AGENTS.md", "README.md", "TODO.md"];

it("does not contain vite.config.js alongside vite.config.ts", () => {
  expect(
    existsSync(fileURLToPath(import.meta.resolve("../vite.config.js"))),
    "Do not create apps/web/vite.config.js; apps/web/vite.config.ts is the canonical Vite configuration.",
  ).toBe(false);
});

it("does not contain a root CONTEXT.md", () => {
  expect(
    existsSync(fileURLToPath(import.meta.resolve("../../../CONTEXT.md"))),
    "Do not create a root CONTEXT.md; put repository-wide agent guidance in AGENTS.md and module-specific guidance in the relevant docs/ guide.",
  ).toBe(false);
});

it("keeps root Markdown limited to repository entry points", () => {
  const rootMarkdownFiles = readdirSync(repositoryRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  expect(
    rootMarkdownFiles,
    "Move other Markdown documentation into docs/ and link to it from AGENTS.md or README.md.",
  ).toEqual(allowedRootMarkdownFiles);
});

it("runs production migrations inside a quoted remote script", () => {
  const workflow = readFileSync(
    fileURLToPath(import.meta.resolve("../../../.github/workflows/production.yml")),
    "utf8",
  );

  expect(workflow).not.toContain("ssh streambrew-production docker run");
  expect(workflow).toContain("exec docker run \\");
  expect(workflow).toContain('DATABASE_URL="${DATABASE_URL}?sslmode=disable" exec bunx dbmate');
});

it("deploys the restream media plane when push-only CI is skipped", () => {
  const workflow = readFileSync(
    fileURLToPath(import.meta.resolve("../../../.github/workflows/restream.yml")),
    "utf8",
  );

  expect(workflow).toContain(`  deploy:
    name: Deploy restream media plane
    if: >-
      always() &&
      needs.resolve.result == 'success' &&
      needs.publish.result == 'success'`);
});
