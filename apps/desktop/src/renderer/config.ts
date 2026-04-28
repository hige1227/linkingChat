/// <reference types="vite/client" />

const PROD_API = 'https://linkchat-api.matrix-ai.com.cn';
const LOCAL_API = 'http://localhost:3008';

const injectedApi =
  typeof __LINKINGCHAT_API_URL__ !== 'undefined'
    ? __LINKINGCHAT_API_URL__
    : '';
const injectedWs =
  typeof __LINKINGCHAT_WS_URL__ !== 'undefined'
    ? __LINKINGCHAT_WS_URL__
    : '';

export const API_BASE_URL: string =
  injectedApi || import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PROD_API : LOCAL_API);
export const WS_URL: string =
  injectedWs || import.meta.env.VITE_WS_URL || API_BASE_URL;
