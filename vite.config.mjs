import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `virtual:sql-wasm` exports SQLite's wasm as base64, so it also works in the desktop app,
// which runs from file:// where a separate .wasm file cannot be fetched.
const sqlWasm = {
  name: 'sql-wasm-inline',
  resolveId: (id) => (id === 'virtual:sql-wasm' ? '\0sql-wasm' : null),
  load(id) {
    if (id !== '\0sql-wasm') return null;
    const file = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm');
    return `export default ${JSON.stringify(readFileSync(file).toString('base64'))};`;
  },
};

export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react(), sqlWasm],
  build: { outDir: '../dist', emptyOutDir: true },
});
