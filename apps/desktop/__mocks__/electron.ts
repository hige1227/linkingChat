// Mock for electron module in Jest tests
const electron = {
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getPath: (name: string) => `/mock/${name}`,
    on: jest.fn(),
    whenReady: jest.fn().mockResolvedValue(undefined),
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeHandler: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    webContents: { send: jest.fn() },
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    on: jest.fn(),
    getAllWindows: jest.fn().mockReturnValue([]),
  })),
};

electron.BrowserWindow.getAllWindows = jest.fn().mockReturnValue([]);

module.exports = electron;
