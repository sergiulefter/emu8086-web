// Checks the production build in dist/ (run after `npm run build`):
// metadata and JSON-LD survived the build, every local asset reference is
// relative (keeps the build portable between hosts) and exists,
// and the crawler / social files were copied. Exits non-zero on any problem.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const SITE = 'https://emu8086.sergiulefter.com/';
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found: run `npm run build` first');
  process.exit(1);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');

check(/<title>emu8086-web[^<]*<\/title>/.test(html), 'title missing or not branded');
check((html.match(/<link rel="canonical"/g) ?? []).length === 1, 'expected exactly one canonical link');
check(html.includes(`<link rel="canonical" href="${SITE}"`), 'canonical URL is wrong');
check((html.match(/<meta name="description"/g) ?? []).length === 1, 'expected exactly one meta description');
check(!/noindex/i.test(html), 'production HTML contains noindex');
for (const k of ['og:title', 'og:description', 'og:url', 'og:image']) check(html.includes(`property="${k}"`), `missing ${k}`);
for (const k of ['twitter:card', 'twitter:image']) check(html.includes(`name="${k}"`), `missing ${k}`);

const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
check(!!ld, 'JSON-LD missing');
if (ld) {
  try {
    const data = JSON.parse(ld[1]);
    check(data.name === 'emu8086-web' && data.url === SITE, 'JSON-LD name/url wrong');
  } catch (e) {
    problems.push(`JSON-LD does not parse: ${e.message}`);
  }
}

// every src/href that is not absolute (http, data:, #) must be relative and exist in dist/
for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
  const url = m[1];
  if (/^(https?:|data:|#|mailto:)/.test(url)) continue;
  check(!url.startsWith('/'), `expected a portable relative asset URL: ${url}`);
  check(existsSync(join(dist, url.replace(/^\.\//, ''))), `referenced file missing from dist: ${url}`);
}
// CSS url() references
for (const f of readdirSync(join(dist, 'assets')).filter((n) => n.endsWith('.css'))) {
  const css = readFileSync(join(dist, 'assets', f), 'utf8');
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
    const url = m[1].replace(/["']/g, '');
    if (/^(data:|https?:)/.test(url)) continue;
    check(!url.startsWith('/'), `root-absolute CSS url in ${f}: ${url}`);
    check(existsSync(join(dist, 'assets', url)), `CSS url target missing: ${url}`);
  }
}

for (const f of ['robots.txt', 'sitemap.xml', 'og-image.png', 'favicon.svg', 'favicon-48.png', 'apple-touch-icon.png']) {
  check(existsSync(join(dist, f)), `${f} missing from dist`);
}

// The guide must remain a complete static document, including its navigation.
const guidePath = join(dist, 'guide', 'index.html');
check(existsSync(guidePath), 'guide/index.html missing from dist');
if (existsSync(guidePath)) {
  const guide = readFileSync(guidePath, 'utf8');
  check(guide.includes(`<link rel="canonical" href="${SITE}guide/"`), 'guide canonical URL is wrong');
  check((guide.match(/<h1\b/g) ?? []).length === 1, 'guide must have one main heading');
  check(!/<script\b[^>]*\bsrc=/.test(guide), 'guide should not require an application script');
  check(!/noindex/i.test(guide), 'guide contains noindex');
  for (const m of guide.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|data:|#|mailto:)/.test(url)) continue;
    check(!url.startsWith('/'), `expected a portable guide asset URL: ${url}`);
    check(existsSync(join(dirname(guidePath), url.split(/[?#]/)[0])), `guide link target missing: ${url}`);
  }
  try {
    const guideLd = guide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const data = JSON.parse(guideLd?.[1] ?? '');
    check(data.url === `${SITE}guide/`, 'guide structured data URL is wrong');
  } catch {
    problems.push('guide structured data is missing or invalid');
  }
}
check(readFileSync(join(dist, 'sitemap.xml'), 'utf8').includes(`${SITE}guide/`), 'guide missing from sitemap');
// the og:image must be the file we ship
const og = html.match(/property="og:image" content="([^"]+)"/);
check(og && og[1] === `${SITE}og-image.png`, 'og:image URL does not point to the shipped og-image.png');

if (problems.length) {
  console.error(`SEO check failed (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('SEO check passed: emulator and static guide metadata, JSON-LD, assets, links, robots.txt, sitemap.xml and social image are in dist/');
