import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here, envDir: false, plugins: [react()],
  resolve: { alias: [
    { find: /^.*\/services\/firebaseApi$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/services\/inspectionApi$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/services\/economyApi$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/lib\/firebase$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/store\/session$/, replacement: here + 'mocks.ts' },
  ] },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});
