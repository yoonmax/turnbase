import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, normalize, relative, resolve, sep } from 'node:path';

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

// After a build, writes dist/sw.js with every file of the build listed for precaching, so
// the installed app (and the scramble worker) runs offline. The version is a hash of the
// files themselves, so any change makes browsers fetch a new worker.
function offlineServiceWorker() {
  let outDir = 'dist';
  return {
    name: 'turnbase-offline-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(full);
        }
      };
      walk(outDir);
      const hash = createHash('sha256');
      const urls = files
        .map((full) => ({ full, url: `/${relative(outDir, full).split(sep).join('/')}` }))
        .filter(({ url }) => url !== '/sw.js' && !url.endsWith('.map') && !url.endsWith('.DS_Store'))
        .sort((a, b) => a.url.localeCompare(b.url))
        .map(({ full, url }) => {
          hash.update(url).update(readFileSync(full));
          return url === '/index.html' ? '/' : url;
        });
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(resolve('src/sw-template.js'), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls)));
    },
  };
}

export default defineConfig({
  plugins: [serveVendoredModules(), react(), tailwindcss(), offlineServiceWorker()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500, modulePreload: false },
  optimizeDeps: { exclude: ['cubing'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
});
