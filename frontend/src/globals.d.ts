export {};

declare global {
  interface Window {
    electronAPI?: any;
    electronAPIError?: string;
    platform?: any;
  }
}

