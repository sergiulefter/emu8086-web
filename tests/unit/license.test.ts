import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { build } from 'vite';

const read = (path: string) => readFileSync(path, 'utf8');
const name = 'emu8086-web Source-Available License v1.0';

describe('project licence', () => {
  it('identifies the licensor and the boundary with MIT releases', () => {
    const text = read('LICENSE');
    expect(text.split(/\r?\n/)[0]).toBe(name);
    expect(text).toContain('Copyright (c) 2026 Sergiu Lefter');
    expect(text).toContain('v1.3.5 (d9f77b90500ae3ea8fad795499fffcb4568fced4)');
    expect(text).toContain('Earlier MIT grants remain in force');
  });

  it('points package metadata and the README to the custom licence', () => {
    expect(JSON.parse(read('package.json')).license).toBe('SEE LICENSE IN LICENSE');
    expect(JSON.parse(read('package-lock.json')).packages[''].license).toBe('SEE LICENSE IN LICENSE');
    expect(read('README.md')).toContain(name);
    expect(read('README.md')).toMatch(/## License[\s\S]*\[LICENSE\]\(LICENSE\)/);
  });

  it('ships the complete project licence followed by the independent third-party notices', async () => {
    const result = await build({ build: { write: false }, logLevel: 'silent' });
    const files = (Array.isArray(result) ? result : [result]).flatMap(r => 'output' in r ? r.output : []);
    const notices = files.find(file => file.fileName === 'LICENSES.txt');
    if (notices?.type !== 'asset') throw new Error('Missing LICENSES.txt');

    const [project, thirdParty] = String(notices.source).split('Third-party materials and their respective terms');
    expect(project).toContain(read('LICENSE').trim());
    for (const credit of ['CC BY-SA 4.0', 'VileR', 'fonts/LICENSE-oldschool-pc-fonts.txt', 'EMU8086.COM',
      'http://www.emu8086.com', 'Barry Allyn', 'emu8086.inc', 'classroom examples']) {
      expect(thirdParty).toContain(credit);
    }
    for (const pkg of ['react', '@codemirror/view']) {
      expect(thirdParty).toContain(read(`node_modules/${pkg}/LICENSE`).trim());
    }
  });
});
