# Third-party software, fonts and data

emu8086-web contains **no EMU8086 code, binaries, icons, help text or library files**.
- EMU8086's documentation and program resources were *read* to describe behaviour; see
  [research/EMU8086_DOC_RESEARCH.md](research/EMU8086_DOC_RESEARCH.md).
- The candidate emulator `daohainam/emulator-8086-js` has no licence and was not used ([ADR-001](adr/ADR-001-cpu-engine.md)).

## Bundled at runtime (shipped in the built site)

| Component | Version | Licence | Source |
|---|---|---|---|
| react, react-dom, scheduler | 19.3.1 / 19.3.1 / 0.28.0 | MIT | https://github.com/facebook/react |
| @codemirror/state, view, language, commands, search, streamparser | 6.7.6, 6.43.15, 6.13.1, 6.11.1, 6.7.2, 6.0.0 | MIT | https://codemirror.net |
| @lezer/common, highlight, lr | 1.5.4, 1.2.5, 1.4.11 | MIT | https://lezer.codemirror.net |
| style-mod, crelt, w3c-keyname, @marijn/find-cluster-break | 4.1.4, 1.0.7, 2.2.8, 1.0.4 | MIT | Marijn Haverbeke |
| **The Ultimate Oldschool PC Font Pack** v2.2: Web437_IBM_VGA_8x14, 8x16, 9x16 (`public/fonts/`) | 2.2 (2020-11-21) | **CC BY-SA 4.0**, © VileR, https://int10h.org/oldschool-pc-fonts/ | licence text: `public/fonts/LICENSE-oldschool-pc-fonts.txt` |

The fonts are redistributed unmodified, with attribution, under CC BY-SA 4.0. The ShareAlike term applies to the
fonts themselves, not to this program.

The MIT licence requires the copyright notice to be kept. Each package's LICENSE file is in `node_modules/<package>/`
after `npm install`, and the production bundle keeps the licence comments that the build tool preserves.

## Development and test only (not shipped)

| Component | Licence |
|---|---|
| vite, @vitejs/plugin-react, vitest, tsx | MIT |
| typescript, @playwright/test (and Playwright browsers) | Apache-2.0 |
| @types/react, @types/react-dom, @types/node | MIT |
| **SingleStepTests/8088** v2 test data (Daniel Balsom), downloaded on demand to `.cache/` by `npm run test:conformance`, revision `aea84484abc79d09639d855b7b0ab32bc9e4dbeb`; not committed | MIT |

`npm ls --omit=dev --all` lists the exact installed versions; `package-lock.json` pins them.
