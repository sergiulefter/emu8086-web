/**
 * Search-engine metadata, crawler files, branding and documentation links.
 * The production build is checked separately by scripts/check-seo.mjs (npm run check:seo).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const html = read('index.html');
const SITE = 'https://emu8086.sergiulefter.com/';

const meta = (attr: 'name' | 'property', key: string): string[] =>
  [...html.matchAll(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'g'))].map((m) => m[1]);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(join(root, path));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('index.html metadata', () => {
  it('has language, charset, viewport and a single title', () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<meta charset="UTF-8" \/>/);
    expect(meta('name', 'viewport')).toEqual(['width=device-width, initial-scale=1.0']);
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
    expect(titles).toEqual(['emu8086-web | Free Online 8086 Emulator &amp; Assembler']);
  });

  it('has one meta description of a search-result friendly length', () => {
    const d = meta('name', 'description');
    expect(d).toHaveLength(1);
    expect(d[0].length).toBeGreaterThan(70);
    expect(d[0].length).toBeLessThanOrEqual(230);
    expect(d[0]).toContain('emu8086-web');
    // positioning: EMU8086-style experience, Linux, browser, no installation
    for (const phrase of ['EMU8086-style', 'Linux', 'browser', 'without installation']) expect(d[0]).toContain(phrase);
  });

  it('social titles use the "|" title format and describe the EMU8086-style experience', () => {
    for (const t of [...meta('property', 'og:title'), ...meta('name', 'twitter:title')]) {
      expect(t).toBe('emu8086-web | Online EMU8086-Style Emulator &amp; Debugger');
    }
    expect(meta('property', 'og:description')[0]).toMatch(/EMU8086 alternative[\s\S]*Linux/);
    expect(meta('name', 'twitter:description')[0]).toMatch(/EMU8086 alternative[\s\S]*Linux/);
  });

  it('never overclaims compatibility with the original EMU8086', () => {
    expect(html).not.toMatch(/100\s*%|identical to|official EMU8086|every EMU8086 feature|perfect (EMU8086 )?clone|fully compatible/i);
  });

  it('has exactly one canonical URL and no noindex', () => {
    const canon = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
    expect(canon).toEqual([SITE]);
    expect(html.toLowerCase()).not.toContain('noindex');
    expect(meta('name', 'robots')).toEqual(['index, follow']);
    expect(html).not.toMatch(/name="keywords"/);
  });

  it('has Open Graph and Twitter metadata with absolute URLs', () => {
    for (const k of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image']) expect(meta('property', k)).toHaveLength(1);
    for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) expect(meta('name', k)).toHaveLength(1);
    expect(meta('property', 'og:url')).toEqual([SITE]);
    expect(meta('property', 'og:image')).toEqual([`${SITE}og-image.png`]);
    expect(meta('name', 'twitter:image')).toEqual([`${SITE}og-image.png`]);
    expect(meta('name', 'twitter:card')).toEqual(['summary_large_image']);
  });

  it('has valid, honest JSON-LD for the web application', () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocks).toHaveLength(1);
    const data = JSON.parse(blocks[0][1]);
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('WebApplication');
    expect(data.name).toBe('emu8086-web');
    expect(data.url).toBe(SITE);
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(data.applicationCategory).toBeTruthy();
    expect(data.operatingSystem).toBeTruthy();
    // nothing fabricated
    for (const k of ['aggregateRating', 'review', 'downloadUrl', 'interactionStatistic', 'award', 'datePublished']) {
      expect(data[k]).toBeUndefined();
    }
  });

  it('has a real description and a noscript message before the app mounts', () => {
    const rootDiv = html.slice(html.indexOf('<div id="root">'), html.indexOf('<script type="module"'));
    expect(rootDiv).toMatch(/<h1>emu8086-web/);
    expect(rootDiv).toContain('alternative to EMU8086');
    expect(rootDiv).toMatch(/Chrome and Firefox on Linux, without Wine or a\s+virtual machine/);
    expect(rootDiv).toContain('not affiliated with the original EMU8086');
    expect(rootDiv).toMatch(/<noscript>[\s\S]*needs JavaScript/);
    // no hidden text tricks
    expect(rootDiv).not.toMatch(/display:\s*none|visibility:\s*hidden|font-size:\s*0/);
  });
});

describe('public assets', () => {
  it('social preview image is 1200 x 630', () => {
    expect(pngSize('public/og-image.png')).toEqual({ w: 1200, h: 630 });
  });

  it('icons referenced by index.html exist', () => {
    for (const m of html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/g)) {
      expect(existsSync(join(root, 'public', m[1])), m[1]).toBe(true);
    }
    expect(pngSize('public/favicon-48.png')).toEqual({ w: 48, h: 48 });
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ w: 180, h: 180 });
  });

  it('robots.txt allows crawling and names the sitemap', () => {
    const robots = read('public/robots.txt');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
    expect(robots).toMatch(new RegExp(`^Sitemap: ${SITE}sitemap\\.xml$`, 'm'));
  });

  it('sitemap.xml is a well-formed sitemap containing only the canonical page', () => {
    const xml = read('public/sitemap.xml');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])).toEqual([SITE]);
    expect(xml).not.toContain('<lastmod>');
    // balanced tags
    for (const tag of ['urlset', 'url', 'loc']) {
      expect((xml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length).toBe((xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length);
    }
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const p = join(dir, name);
    if (statSync(join(root, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('branding', () => {
  it('the old product name no longer appears in user-facing files', () => {
    const files = ['index.html', 'README.md', 'CHANGELOG.md', 'package.json', ...walk('src'), ...walk('docs').filter((f) => f.endsWith('.md'))];
    for (const f of files) {
      if (!/\.(ts|tsx|css|html|md|json)$/.test(f)) continue;
      // internal localStorage keys keep their original identifiers on purpose (saved user data)
      const text = read(f).replace(/'8086studio\.[a-z]+\.v1'/g, '');
      expect(text, f).not.toMatch(/8086 ?Studio/i);
    }
  });

  it('the editor window and about box use the new name', () => {
    expect(read('src/ui/windows/EditorWindow.tsx')).toContain('emu8086-web - assembler and microprocessor emulator');
    expect(read('src/ui/windows/Dialogs.tsx')).toContain('about emu8086-web');
  });
});

describe('documentation links', () => {
  it('every relative link in README and docs points to an existing file', () => {
    const docs = ['README.md', 'CHANGELOG.md', ...walk('docs').filter((f) => f.endsWith('.md'))];
    const broken: string[] = [];
    for (const f of docs) {
      const text = read(f).replace(/```[\s\S]*?```/g, '');
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const path = normalize(join(dirname(f), target.split('#')[0]));
        if (!existsSync(join(root, path))) broken.push(`${f} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
