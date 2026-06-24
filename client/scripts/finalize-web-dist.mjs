import { existsSync, renameSync } from 'node:fs';

/** Vite keeps the source HTML name (`index.web.html`); the server expects `index.html`. */
if (existsSync('dist/index.web.html')) {
  renameSync('dist/index.web.html', 'dist/index.html');
}

if (!existsSync('dist/index.html')) {
  console.error('finalize-web-dist: dist/index.html missing after web build');
  process.exit(1);
}
