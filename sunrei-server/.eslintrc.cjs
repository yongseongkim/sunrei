module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: __dirname + '/tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error'],
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
  ignorePatterns: ['.eslintrc.cjs'], // Exclude this file from being linted
};
