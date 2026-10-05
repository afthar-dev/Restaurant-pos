/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testRegex: 'test/.*\.e2e-spec\.ts$',
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/load-test-env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
};
