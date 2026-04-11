// Centralized API URL config for renderer process
// Dev: falls back to localhost:3008 (VITE_API_URL not set)
// Prod: injected via Vite define at build time
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3008';
export const WS_URL: string = import.meta.env.VITE_WS_URL || 'http://localhost:3008';
