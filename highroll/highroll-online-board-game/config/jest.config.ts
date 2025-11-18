import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@client/(.*)$': '<rootDir>/src/client/$1',
    '^@server/(.*)$': '<rootDir>/src/server/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};

export default config;