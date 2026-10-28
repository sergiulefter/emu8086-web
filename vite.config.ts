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

export default defineConfig(({ command }) => ({
  // Production builds use relative URLs so the same dist/ works at any path,
  // e.g. Cloudflare static hosting or `npm run preview`.
  base: command === 'build' ? './' : '/',
  plugins: [react(), bundledLicenses()],
  server: { port: 5173, strictPort: false },
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/conformance/**/*.test.ts'],
    environment: 'node',
    testTimeout: 600000,
  },
}));
