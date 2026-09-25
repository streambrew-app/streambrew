import { defineConfig } from "oxlint";
import { noSelfPositioning } from "oxlint-tw-no-self-positioning";

export default defineConfig({
  categories: {},
  extends: [noSelfPositioning.recommended],
  jsPlugins: [{ name: "eslint-js", specifier: "oxlint-plugin-eslint" }, "@shadcn/lint"],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
    typeAware: true,
    typeCheck: false,
  },
  ignorePatterns: ["apps/web/src/routeTree.gen.ts"],
  settings: {
    react: {
      version: "19.1.1",
    },
    vitest: {
      typecheck: false,
    },
  },
  rules: {
    "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    "shadcn/no-raw-colors": "error",
    "shadcn/no-arbitrary-values": [
      "error",
      {
        // Structural values tied to the OBS stage, safe area, responsive chat, and sidebar motion.
        allow: [
          "layout",
          "p-[4%]",
          "p-[clamp(1rem,2.5vw,2rem)]",
          "pt-[env(safe-area-inset-top)]",
          "[animation-delay:-9s]",
          "text-[0.9em]",
          "transition-[width]",
          "transition-[left,right,width]",
          "transition-[margin,opacity]",
          "transition-[width,height,padding]",
        ],
      },
    ],
    "shadcn/no-inline-styles": "error",
    "shadcn/no-unknown-classes": [
      "error",
      {
        // Defined in alerts.css, which is linked by the document but not imported by styles.css.
        allow: [
          "alert-overlay-root",
          "alert-card-entering",
          "alert-card-exiting",
          "alert-signal",
          "alert-range",
          "overlay-document",
        ],
      },
    ],
    "shadcn/require-static-classes": "error",
    "eslint-js/padding-line-between-statements": [
      "error",
      {
        blankLine: "always",
        prev: "function",
        next: "function",
      },
    ],
    "eslint-js/no-restricted-syntax": [
      "error",
      {
        selector:
          "NewExpression[callee.type='Identifier'][callee.name='URL'] > MemberExpression.arguments:nth-child(2)[computed=false][property.type='Identifier'][property.name='url'] > MetaProperty.object[meta.name='import'][property.name='meta']",
        message: "Use import.meta.resolve(...) instead of new URL(..., import.meta.url).",
      },
    ],
    "require-yield": "off",
    "import/no-cycle": "error",
    "no-restricted-imports": [
      "error",
      {
        name: "neverthrow",
        message: "Use typed native exceptions and Promise rejection for failures.",
      },
      {
        name: "@lebedevna/neverthrow-utils",
        message: "Use the shared native HTTP helpers and typed exceptions.",
      },
    ],
  },
  overrides: [
    {
      files: ["apps/web/src/components/ui/**/*.{ts,tsx}"],
      rules: {
        // Primitives may style the other primitives they compose internally.
        "shadcn/no-restyle": "off",
      },
    },
    {
      files: ["**/*.ts"],
      rules: {
        "no-use-before-define": "error",
      },
    },
    {
      files: ["**/*.tsx"],
      excludeFiles: ["apps/web/src/routes/**"],
      rules: {
        "no-use-before-define": "error",
      },
    },
    {
      files: ["apps/web/src/components/**/*.{ts,tsx}", "apps/web/src/routes/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            name: "@tanstack/react-query",
            importNames: ["useMutation", "useQuery"],
            message: "Wrap queries and mutations in custom hooks under apps/web/src/hooks.",
          },
        ],
      },
    },
  ],
});
