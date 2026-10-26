// Downloads the SingleStepTests/8088 v2 suite (MIT, ~730 MB) into .cache/ for
// `npm run test:conformance`. Skips files that are already present.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'SingleStepTests/8088';
const REV = 'aea84484abc79d09639d855b7b0ab32bc9e4dbeb';
const dir = join(process.cwd(), '.cache', '8088-tests', 'v2');
mkdirSync(dir, { recursive: true });

const listing = await fetch(`https://api.github.com/repos/${REPO}/contents/v2?ref=${REV}`).then((r) => r.json());
if (!Array.isArray(listing)) throw new Error(`GitHub listing failed: ${JSON.stringify(listing)}`);
const missing = listing.filter((f) => !existsSync(join(dir, f.name)));
console.log(`${listing.length} files, ${missing.length} to download`);
let done = 0;
async function worker() {
  while (missing.length) {
    const f = missing.shift();
    const buf = Buffer.from(await (await fetch(f.download_url)).arrayBuffer());
    writeFileSync(join(dir, f.name), buf);
    if (++done % 20 === 0) console.log(`${done} downloaded`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log('conformance suite ready in', dir);
