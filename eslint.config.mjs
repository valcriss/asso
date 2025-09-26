import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  ...compat.config({
    root: true,
    env: {
      es2021: true,
      node: true,
    },
    extends: ['eslint:recommended', 'prettier'],
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    overrides: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
        extends: ['plugin:@typescript-eslint/recommended'],
      },
      {
        files: ['apps/web/**/*.{ts,tsx,vue}'],
        parser: 'vue-eslint-parser',
        parserOptions: {
          parser: '@typescript-eslint/parser',
          ecmaVersion: 'latest',
          sourceType: 'module',
          extraFileExtensions: ['.vue'],
        },
        extends: ['plugin:vue/recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
        env: {
          browser: true,
        },
        globals: {
          defineProps: 'readonly',
          defineEmits: 'readonly',
          defineExpose: 'readonly',
          withDefaults: 'readonly',
        },
        rules: {
          'vue/multi-word-component-names': 'off',
        },
      },
      {
        files: ['apps/api/**/*.{ts,tsx}'],
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
        env: {
          node: true,
        },
      },
      {
        files: ['**/*.cjs'],
        parserOptions: {
          sourceType: 'script',
        },
      },
    ],
  }),
];
