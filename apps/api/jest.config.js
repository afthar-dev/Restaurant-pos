/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  // Keep coverage reports out of src/.
  coverageDirectory: '../coverage',
};
