import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes dist/LICENSES.txt: this project's MIT licence followed by the full
 * licence text of every production dependency bundled into the app (the
 * minified bundle does not keep their licence comments). Fails the build if a
 * bundled package has no licence file.
 */
function bundledLicenses(): Plugin {
  return {
    name: 'bundled-licenses',
    apply: 'build',
    generateBundle() {
      const root = process.cwd();
      const findDir = (name: string, from: string) =>
        [join(from, 'node_modules', name), join(root, 'node_modules', name)].find((d) => existsSync(join(d, 'package.json')));
      const seen = new Map<string, { version: string; license: string; text: string }>();
      const visit = (name: string, from: string) => {
        if (seen.has(name)) return;
        const dir = findDir(name, from);
        if (!dir) throw new Error(`bundled-licenses: cannot find package ${name}`);
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
        if (!file) throw new Error(`bundled-licenses: ${name} has no LICENSE file`);
        seen.set(name, { version: pkg.version, license: pkg.license, text: readFileSync(join(dir, file), 'utf8').trim() });
        for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
      };
      const own = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      for (const dep of Object.keys(own.dependencies ?? {})) visit(dep, root);
      const parts = [
        'emu8086-web - licences',
        '=======================',
        '',
        'emu8086-web itself is licensed under the MIT License:',
        '',
        readFileSync(join(root, 'LICENSE'), 'utf8').trim(),
        '',
        'The fonts in fonts/ are The Ultimate Oldschool PC Font Pack by VileR (int10h.org), licensed under',
        'CC BY-SA 4.0 (see fonts/LICENSE-oldschool-pc-fonts.txt). They are NOT covered by the MIT License above.',
        '',
        'documentation/ is the EMU8086 4.08 documentation, reproduced unchanged.',
        'Copyright (c) 2015 by EMU8086.COM All rights reserved. Portions Copyright 1997-2010 Barry Allyn.',
        'The emu8086 ReadMe allows reproducing it with this copyright notice and a link to http://www.emu8086.com.',
        'It is NOT covered by the MIT License above.',
        '',
        'The application bundle includes EMU8086 4.08\'s emu8086.inc, unchanged, for INCLUDE \'emu8086.inc\'.',
        'Copyright (c) 2015 by EMU8086.COM All rights reserved. http://www.emu8086.com',
        'Reproduced under the same emu8086 ReadMe permission. It is NOT covered by the MIT License above.',
        '',
        'The application bundle (assets/*.js) includes the following third-party packages:',
        ...[...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, p]) => [
          '',
          '-'.repeat(78),
          `${name} ${p.version} (${p.license})`,
          '-'.repeat(78),
          p.text,
        ]),
        '',
      ];
      this.emitFile({ type: 'asset', fileName: 'LICENSES.txt', source: parts.join('\n') });
    },
  };
}

/**
 * Serves static HTML directories the way Cloudflare static assets do in production.
 * Without this the dev and preview servers answer directory URLs with the app shell.
 */
function staticPageIndexes(): Plugin {
  type Next = () => void;
  type Req = { url?: string };
  type Res = { statusCode: number; setHeader(k: string, v: string): void; end(): void };
  const handle = (req: Req, res: Res, next: Next) => {
    const [path, query = ''] = (req.url ?? '').split('?');
    const directory = ['/documentation', '/guide'].find((entry) => path === entry || path === `${entry}/`);
    if (!directory) { next(); return; }
    if (path === directory) {
      res.statusCode = 308;
      res.setHeader('Location', `${directory}/${query ? `?${query}` : ''}`);
      res.end();
      return;
    }
    req.url = `${directory}/index.html${query ? `?${query}` : ''}`;
    next();
  };
  return {
    name: 'static-page-indexes',
    configureServer(server) { server.middlewares.use(handle); },
    configurePreviewServer(server) { server.middlewares.use(handle); },
  };
}

/** The single source of the app version: package.json, exposed to the code as __APP_VERSION__ (see src/version.ts). */
const APP_VERSION = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version as string;

export default defineConfig(({ command }) => ({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  // Production builds use relative URLs so the same dist/ works at any path,
  // e.g. Cloudflare static hosting or `npm run preview`.
  base: command === 'build' ? './' : '/',
  plugins: [react(), bundledLicenses(), staticPageIndexes()],
  server: { port: 5173, strictPort: false },
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/conformance/**/*.test.ts'],
    environment: 'node',
    testTimeout: 600000,
  },
}));
