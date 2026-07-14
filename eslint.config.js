import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `dist` is build output; `supabase/functions` is dead Deno edge-function code
  // superseded by the REST backend (not part of the app build or type program).
  { ignores: ["dist", "supabase/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Ratchet: the Supabase→REST migration left heavy `any` at API boundaries.
      // Kept visible as warnings (not CI-blocking) to be paid down incrementally
      // rather than blocking every build on inherited debt.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-useless-escape": "warn",
      // Empty catch blocks are an intentional best-effort pattern in this codebase.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
