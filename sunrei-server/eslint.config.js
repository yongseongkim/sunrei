import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'unused-imports/no-unused-imports': 'error', // 사용하지 않는 import 자동 제거
    },
  },
];
