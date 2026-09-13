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
      // Node belongs in the integration test that spawns the lab server, and
      // nowhere else: this application runs in a browser.
      'no-restricted-imports': ['error', { patterns: ['node:*'] }],
    },
  },
  {
    files: ['**/*.node.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
