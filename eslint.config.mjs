// TASKS.csv #446 — lint the app in CI. Only rules that catch real bugs are errors: an undefined name (a
// refactor that left a reference behind), a hook called conditionally, a duplicate key. Style is not linted.
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

export default [
  { ignores: ["dist/**", "release/**", "node_modules/**", "python-sidecar/**", "public/**", "**/*.min.js"] },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks, react },
    rules: {
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-self-assign": "error",
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_|^React$", caughtErrors: "none" }],
      "react/jsx-uses-vars": "error", // JSX use counts as use (otherwise every component reads as unused)
      "react/jsx-uses-react": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off", // many deliberate, commented omissions; the rule would be noise
    },
  },
  {
    files: ["electron/**/*.js", "scripts/**/*.mjs", "test/**/*.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, window: "writable" } }, // the store test fakes window
    rules: { "no-undef": "error", "no-dupe-keys": "error", "no-unreachable": "error" },
  },
  { files: ["electron/**/*.js"], languageOptions: { sourceType: "commonjs" } },
];
