# Third-party software, fonts and data

## This project's licence

The [emu8086-web Source-Available License v1.0](../LICENSE) applies only to original material for which
Sergiu Lefter controls licensing rights. Historical MIT grants remain in effect for previously licensed
material, including the project source at v1.3.5.

The following material retains its own terms:

- the EMU8086 documentation and macro library, third-party packages and fonts listed below
- short quotations of EMU8086 captions, messages and documentation in
  [research/EMU8086_DOC_RESEARCH.md](research/EMU8086_DOC_RESEARCH.md), cited only to document behaviour
- the two short classroom exercises reproduced for compatibility testing: `fixtures/T001_professor_H.asm`,
  `fixtures/T002_diagonal_HELLO.asm`, `fixtures/T002b_classroom_HELLO.asm`, and the matching examples *video
  memory: H* and *video memory: diagonal HELLO* in `src/examples/index.ts`. They come from university course
  material. Sergiu Lefter has confirmed permission to publish them as examples in emu8086-web.
  Their rights remain with their respective holders.

The candidate emulator `daohainam/emulator-8086-js` has no licence and was not used
([ADR-001](adr/ADR-001-cpu-engine.md)).

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

**EMU8086 4.08 documentation** (`public/documentation/`, served at https://emu8086.sergiulefter.com/documentation/):
Copyright (c) 2015 by EMU8086.COM. All rights reserved. Portions Copyright 1997-2010 Barry Allyn.
The installation's root `ReadMe.txt`, under COPYRIGHTS, permits reproducing, uploading, copying or
translating reference information if the use includes the copyright notice and a hyperlink to
[EMU8086.COM](http://www.emu8086.com). The documentation files match the installation apart from the
added notice frame in `index.html` and the new `notice.html` that displays the notice and link.
When serving or building the site, Vite adds the copyright notice and link to standalone articles
and a notice frame to the two other framesets, so direct links also carry the attribution.
`tests/unit/documentation.test.ts` checks the original files by SHA-256.

**EMU8086 4.08 macro library** (`src/assembler/includes/emu8086.inc`, bundled for `INCLUDE 'emu8086.inc'`):
Copyright (c) 2015 by EMU8086.COM. All rights reserved. [EMU8086.COM](http://www.emu8086.com).
The bundled source file matches the installed `inc/emu8086.inc` byte for byte.
The emu8086-web license grants no rights in this file.

These statements were checked against the installed texts in the
[archived 4.08r11 distribution](https://github.com/dong-zj/C-compiler/blob/dcc6cf7f873d8fdbd51c1c92ec9d2f4e8d9810f4/emu8086v408r11.zip)
(archive SHA-256 `d56d6e42fe170c52df5abd6002b1e8fef0b840eb8d8807d77819fe1fc2e17afd`).
The bundled `documentation/_readme.txt` contains viewing instructions only.

## Production notices

Every production build writes **`LICENSES.txt`** next to `index.html`. It contains the full project
license, separate notices for bundled third-party materials, and the complete licence text of each
runtime dependency. The font licence ships alongside the fonts. The `bundled-licenses` plugin in
`vite.config.ts` fails the build if a bundled package has no licence file. The official site serves
the [build notices](https://emu8086.sergiulefter.com/LICENSES.txt).

## Development and test only (not shipped)

| Component | Licence |
|---|---|
| vite, @vitejs/plugin-react, vitest, tsx | MIT |
| typescript, @playwright/test (and Playwright browsers) | Apache-2.0 |
| @types/react, @types/react-dom, @types/node | MIT |
| **SingleStepTests/8088** v2 test data (Daniel Balsom), downloaded on demand to `.cache/` by `npm run test:conformance`, revision `aea84484abc79d09639d855b7b0ab32bc9e4dbeb`; not committed | MIT |

`npm ls --omit=dev --all` lists the exact installed versions; `package-lock.json` pins them.
