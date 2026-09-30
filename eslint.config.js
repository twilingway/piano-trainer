import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "eslint.config.js",
      ".agents/**",
      "tools/arcadia-effects/**",
      "public/generated/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      // `const { dropped, ...rest } = value` is how a field is removed from an immutable copy.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }]
    }
  },
  {
    // docs/CODE_STYLE.md: a production module stays under 500 lines; tests do not count.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }]
    }
  }
);
