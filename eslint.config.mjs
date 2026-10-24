import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/types/**", "**/.claude-plugin/types/**", "**/node_modules/**"] },
  {
    files: ["plugins/statusline/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      jsdoc.configs["flat/recommended-typescript-error"],
      prettier,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      // checksVoidReturn は claude-code の on() の型を解決しきれず、検査が終わらない
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
    },
  },
);
