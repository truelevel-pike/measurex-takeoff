import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  // Exclude tests that require a live server or external services
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/tests/api.integration.test.ts',  // requires running dev server
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(kdbush|supercluster|@turf)/)',
  ],
};

export default createJestConfig(config);
