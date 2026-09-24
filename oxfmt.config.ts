import { defineConfig } from "oxfmt";

export default defineConfig({
  singleQuote: false,
  printWidth: 100,
  quoteProps: "preserve",
  sortTailwindcss: {
    stylesheet: "apps/client/styles.css",
    functions: ["clsx", "cn", "cva", "tw", "withProps"],
  },
  ignorePatterns: ["*.gen.*", "*.yaml", "*.toml"],
  sortImports: true,
});
