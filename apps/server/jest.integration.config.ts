import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testRegex: '__tests__/ws-integration/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@linkingchat/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  maxWorkers: 1, // Serial execution to avoid port conflicts
};

export default config;
