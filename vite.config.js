import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, existsSync } from 'node:fs';
import { normalize, resolve } from 'node:path';

// The cubing.js bundle in public/ is loaded by URL at runtime, as a real ES module. The
// dev server would refuse that, since it treats any import of a public file as a mistake,
// so these files are served as they are, ahead of Vite's own handling.
function serveVendoredModules() {
  const root = resolve('public');
  return {
    name: 'turnbase-serve-vendored-modules',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = normalize(decodeURIComponent((req.url ?? '').split('?')[0]));
        if (!path.startsWith('/vendor/cubing/') || !path.endsWith('.js')) return next();
        const file = resolve(root, `.${path}`);
        if (!file.startsWith(root) || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'text/javascript');
        createReadStream(file).pipe(res);
        return undefined;
      });
    },
  };
}

export default defineConfig({
  plugins: [serveVendoredModules(), react(), tailwindcss()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500, modulePreload: false },
  optimizeDeps: { exclude: ['cubing'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
});
