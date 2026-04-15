// Mock for electron module in Jest tests
const BrowserWindowMock: any = jest.fn().mockImplementation(() => ({
  webContents: { send: jest.fn() },
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  on: jest.fn(),
}));
BrowserWindowMock.getAllWindows = jest.fn().mockReturnValue([]);

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
  BrowserWindow: BrowserWindowMock,
};

module.exports = electron;
