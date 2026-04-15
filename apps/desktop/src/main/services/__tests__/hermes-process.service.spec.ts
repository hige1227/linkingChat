import { HermesProcessService } from '../hermes-process.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    pid: 12345,
    killed: false,
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  })),
}));

jest.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getPath: (name: string) => `/mock/${name}`,
  },
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  accessSync: jest.fn(),
  createWriteStream: jest.fn(() => ({ write: jest.fn(), end: jest.fn() })),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  unlinkSync: jest.fn(),
}));

describe('HermesProcessService', () => {
  let service: HermesProcessService;

  beforeEach(() => {
    service = new HermesProcessService();
    jest.clearAllMocks();
  });

  it('getStatus returns not running initially', () => {
    const status = service.getStatus();
    expect(status.running).toBe(false);
    expect(status.restartCount).toBe(0);
  });

  it('isProcessRunning returns false when no process', () => {
    expect(service.isProcessRunning()).toBe(false);
  });

  it('resolveBinaryPath returns hermes path when sidecar exists', () => {
    const { accessSync } = require('fs');
    (accessSync as jest.Mock).mockImplementation(() => undefined);
    const path = service.resolveBinaryPath();
    expect(path).toMatch(/hermes-env/);
  });

  it('resolveBinaryPath returns null when sidecar missing', () => {
    const { accessSync } = require('fs');
    (accessSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT'); });
    const path = service.resolveBinaryPath();
    expect(path).toBeNull();
  });
});
