import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('project licence', () => {
  it('LICENSE is the standard MIT text with the project copyright', () => {
    const text = read('LICENSE');
    expect(text.split('\n')[0]).toBe('MIT License');
    expect(text).toContain('Copyright (c) 2026 Sergiu Lefter');
    expect(text).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy');
    expect(text).toContain('The above copyright notice and this permission notice shall be included in all');
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR');
    expect(text).not.toMatch(/\[year\]|\[fullname\]/);
  });

  it('package.json declares MIT and the README links the licence', () => {
    expect(JSON.parse(read('package.json')).license).toBe('MIT');
    expect(read('README.md')).toMatch(/## License[\s\S]*\[LICENSE\]\(LICENSE\)/);
  });

  it('third-party notices keep the font licence and state what MIT does not cover', () => {
    const notices = read('docs/THIRD_PARTY_NOTICES.md');
    expect(notices).toContain('CC BY-SA 4.0');
    expect(notices).toContain('does **not** cover');
    expect(notices).toContain('LICENSES.txt');
  });
});
