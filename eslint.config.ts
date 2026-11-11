import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import pluginPrettier from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', '.local/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // TS 由 tsc 做类型检查；脚本里的 node / 浏览器全局也统一交给 tsc 与运行时，
    // 这里关掉 no-undef，免得 js/mjs 脚本被误报 console / process 未定义。
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': 'error',
    },
  },
  pluginPrettier,
);
