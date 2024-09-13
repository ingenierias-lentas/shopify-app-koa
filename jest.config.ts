module.exports = {
  preset: 'ts-jest', // Use ts-jest to handle TypeScript files
  testEnvironment: 'node', // Set the environment to node
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest', // Use ts-jest for transforming TypeScript files
  },
  testRegex: '.*\\.test\\.(tsx?|jsx?)$', // Regular expression for test files
  watchPathIgnorePatterns: ['<rootDir>/node_modules/'],
  testPathIgnorePatterns: ['.*/tests/fixtures/'], // Ignore specific directories
  setupFilesAfterEnv: [`${__dirname}/src/__tests__/setup-jest.ts`],
};
