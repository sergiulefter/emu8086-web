// The EMU8086 4.08 documentation in public/documentation is served as installed. These checks keep
// it byte-for-byte identical to the original files (hashes taken from C:\emu8086\documentation)
// and keep the copyright notice and emu8086.com link that its ReadMe requires.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import manifest from './documentation.sha256.json';

const root = join(process.cwd(), 'public/documentation');
const sha256 = (rel: string) => createHash('sha256').update(readFileSync(join(root, rel))).digest('hex');

function files(rel = ''): string[] {
  return readdirSync(join(root, rel)).flatMap((n) => {
    const r = rel ? `${rel}/${n}` : n;
    return statSync(join(root, r)).isDirectory() ? files(r) : [r];
  });
}

describe('EMU8086 documentation', () => {
  it('every original file is present and unchanged', () => {
    for (const [rel, hash] of Object.entries(manifest)) expect(sha256(rel), rel).toBe(hash);
  });

  it('only the frameset index.html and the notice frame are added or changed', () => {
    const extra = files().filter((f) => !(f in manifest)).sort();
    expect(extra).toEqual(['index.html', 'notice.html']);
  });

  it('the frameset keeps the original menu and index frames and adds the notice frame', () => {
    const index = readFileSync(join(root, 'index.html'), 'latin1');
    expect(index).toContain('<frame BORDER=1 src="menu.html" scrolling=NO MARGINHEIGHT=2 MARGINWIDTH=2>');
    expect(index).toContain('<frame name="bigwindow" src="help.html" scrolling="auto">');
    expect(index).toMatch(/<frameset rows="35,\*,22">/);
    expect(index).toContain('src="notice.html"');
    expect(index).toContain('\r\n'); // original CRLF line endings
  });

  it('the notice carries the EMU8086 copyright and a link to emu8086.com', () => {
    const notice = readFileSync(join(root, 'notice.html'), 'utf8');
    expect(notice).toContain('Copyright &copy; 2015 by EMU8086.COM. All rights reserved.');
    expect(notice).toContain('href="http://www.emu8086.com"');
  });

  it('every local link and image resolves inside the folder', () => {
    for (const f of files().filter((n) => n.endsWith('.html'))) {
      const html = readFileSync(join(root, f), 'latin1');
      for (const m of html.matchAll(/\b(?:href|src)\s*=\s*"([^"#]+)(?:#[^"]*)?"/gi)) {
        const url = m[1];
        if (/^(https?:|mailto:)/i.test(url) || url === '../') continue;
        expect(existsSync(join(root, url)), `${f} -> ${url}`).toBe(true);
      }
    }
  });
});
