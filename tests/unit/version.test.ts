import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_VERSION } from '../../src/version';

describe('app version', () => {
  it('comes from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('is not written by hand anywhere in the UI source', () => {
    const files = ['src/ui/windows/Dialogs.tsx', 'src/ui/actions.ts'];
    for (const f of files) expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toMatch(/emu8086-web \d+\.\d+/);
  });
});
