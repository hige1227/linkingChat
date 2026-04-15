// Mock for electron-store in Jest tests
const Store = jest.fn().mockImplementation(() => ({
  get: jest.fn((key: string, defaultVal?: any) => defaultVal),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  has: jest.fn().mockReturnValue(false),
}));

module.exports = Store;
module.exports.default = Store;
