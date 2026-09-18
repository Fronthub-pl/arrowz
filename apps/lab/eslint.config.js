import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  // `configs.flat.*` — `configs['recommended-latest']` is the legacy eslintrc
  // shape (`plugins` as an array), which ESLint 10 rejects outright.
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // The repository's two hard rules. deno lint enforces them in packages/;
      // apps/ is outside its reach, so they are stated here.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // tsc exempts `_`-prefixed bindings; this rule does not unless told to.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // This application runs in a browser. The two exemptions below are the
      // only places Node belongs: the build-output smoke and the integration
      // test that spawns the store server.
      'no-restricted-imports': ['error', { patterns: ['node:*'] }],
    },
  },
  // The build-output smoke is a Node script by nature: it reads dist/ and sets
  // an exit code. The application itself still may not import node: modules.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', URL: 'readonly' } },
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.node.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
