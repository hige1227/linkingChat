import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const PROD_API = 'https://linkchat-api.matrix-ai.com.cn';
const LOCAL_API = 'http://localhost:3008';
const isBuild = process.argv.includes('build') || process.env.NODE_ENV === 'production';
const defaultApi = process.env.VITE_API_URL || process.env.API_BASE_URL || (isBuild ? PROD_API : LOCAL_API);
const defaultWs = process.env.VITE_WS_URL || process.env.WS_URL || defaultApi;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(defaultApi),
      'import.meta.env.VITE_WS_URL': JSON.stringify(defaultWs),
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
      },
    },
    plugins: [react()],
  },
});
