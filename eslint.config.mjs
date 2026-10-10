// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Feature boundaries for the React apps (see apps/web/ARCHITECTURE.md):
 * app/ wires features together; a feature imports another only through its index;
 * only a feature's api.ts calls the HTTP client; components and pages use feature hooks;
 * shared/ never imports features or app/.
 */
const appWiring = {
  group: ['@/app', '@/app/*'],
  message: 'Features and shared code must not import app wiring.',
};
const featureInternals = {
  group: ['@/features/*/*'],
  message: 'Import another feature only through its index (@/features/<name>).',
};
/** @param {string} fetcher the HTTP client function of that app */
const httpClient = (fetcher) => ({
  name: '@/shared/api/http',
  importNames: [fetcher],
  message: "Only a feature's api.ts calls the HTTP client.",
});
const queryHooks = {
  name: '@tanstack/react-query',
  importNames: ['useQuery', 'useInfiniteQuery', 'useMutation', 'useQueryClient'],
  message: 'Components use the hooks in the feature queries.ts and mutations.ts.',
};

/**
 * @param {string} src the app's src folder
 * @param {string} fetcher the HTTP client function only api.ts files may use
 */
function boundaries(src, fetcher) {
  const http = httpClient(fetcher);
  const restrict = (/** @type {object[]} */ patterns, /** @type {object[]} */ paths = []) => ({
    'no-restricted-imports': ['error', { patterns, paths }],
  });
  const recharts = {
    name: 'recharts',
    message: 'Charts live in features/reports/charts/ so Recharts stays out of the first bundle.',
  };
  return [
    { files: [`${src}/app/**/*.{ts,tsx}`], rules: restrict([featureInternals], [recharts]) },
    {
      files: [`${src}/features/**/*.{ts,tsx}`],
      rules: restrict([appWiring, featureInternals], [http, recharts]),
    },
    {
      files: [`${src}/features/**/api.ts`],
      rules: restrict([appWiring, featureInternals], [recharts]),
    },
    {
      files: [`${src}/features/*/components/**/*.tsx`, `${src}/features/*/pages/**/*.tsx`],
      rules: restrict([appWiring, featureInternals], [http, queryHooks, recharts]),
    },
    {
      files: [`${src}/shared/**/*.{ts,tsx}`],
      rules: restrict(
        [
          {
            group: ['@/features', '@/features/*', '@/app', '@/app/*'],
            message: 'Shared code never imports features or app wiring.',
          },
        ],
        [recharts],
      ),
    },
    // The one folder allowed to import Recharts (reached only through lazy screens).
    {
      files: [`${src}/features/reports/charts/**/*.{ts,tsx}`],
      rules: restrict([appWiring, featureInternals], [http]),
    },
  ];
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/api/prisma/migrations/**',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/*.js',
      'scripts/**',
      'apps/*/scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/qr/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      // randomUUID is missing on plain-http LAN pages (not a secure context).
      'no-restricted-properties': [
        'error',
        {
          object: 'crypto',
          property: 'randomUUID',
          message:
            'Use newId() from @rpos/shared: crypto.randomUUID is missing on plain-http LAN pages.',
        },
      ],
    },
  },
  ...boundaries('apps/web/src', 'apiFetch'),
  ...boundaries('apps/qr/src', 'qrFetch'),
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Nest decorators and DTO classes use type imports at runtime (emitDecoratorMetadata).
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.{test,spec,e2e-spec}.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.jest, ...globals.vitest } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      // Tests may reach into another feature's internals to set up a screen.
      'no-restricted-imports': 'off',
    },
  },
);
