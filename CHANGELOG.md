# Changelog

## Unreleased

Fixes from comparing classroom programs side by side with EMU8086 4.08 running on Windows:

- **`LEA` with a direct address** (`LEA SI, x`, `LEA AX, [1234h]`, `LEA SI, ES:x`) now assembles to
  `MOV reg, imm16` (`BE 15 01`) as EMU8086 does, one byte shorter than the `8D` form. Program size in CX and every
  later address now match. LEA with BX/BP/SI/DI is unchanged.
- **.COM loading** places 20 `NOP`s and a `HLT` after the program, as EMU8086's loader does. Reading past the data
  yields `90h`, and the memory list shows where DUP arrays end instead of an unbroken run of `NULL`s. The PSP now
  holds only `INT 20h` and the empty command tail; the `A000h` word and the `INT 21h/RETF` at 50h are gone.
- **Memory list:** every byte of the instruction at CS:IP is highlighted in blue (the trailing bytes were
  yellow). Control-character names follow EMU8086: `BACK`, `NEWL`, `CRET`, `SPA` (space; previously no name)
  and `RES`. `1Bh` shows its glyph. Addresses and decimal values are grey.
- **Selecting bytes in the emulator** works as in EMU8086. Clicking a memory row selects that byte in yellow
  and restarts the disassembly at it, even mid-instruction. Clicking a disassembly line selects every byte of
  its instruction. A selection under CS:IP turns green and stays across steps. The address boxes show the
  selection, or the first visible row after scrolling, and return to CS:IP after each instruction. The source
  window shows the selected line inverted until the next step. Arrow keys scroll the memory list. List colours
  were sampled from EMU8086: blue `#0000FF`, yellow `#FFFF96`, green `#009B00`.
- **EMU8086 documentation:** F1, the help button and help → documentation and tutorials open EMU8086 4.08's own
  HTML documentation and tutorials, unchanged, at `/documentation/` in a separate browser tab. A bottom frame shows
  the EMU8086.COM copyright notice and emu8086.com link that its licence requires. SHA-256 tests keep the files
  identical to the installed originals. This replaces the in-app quick guide.
- **Menus match EMU8086 4.08:** edit → advanced gains show line numbers, tabify / untabify selection and display
  whitespace. advanced editor macros, fasm, set output directory and the eight virtual device programs are listed
  greyed out. help → check for an update is added. file → new no longer lists an extra "empty" item; the code
  template dialog keeps "empty workspace".
- **ascii codes window** looks and behaves like EMU8086 4.08's. It is a fixed-size white table of 8 columns of 32
  codes filled top to bottom, with entries such as `065: A`. Numbers are grey, and control codes show as red
  `null`, `beep`, `back`, `tab`, `newl`, `cret`, `spa` and `res`. A click switches all numbers between decimal and
  hexadecimal. The old 16-column grid and its status bar are gone.

## 1.1.0 — 2026-10-31

- **Directive UI review:** checked EMU8086's documentation, configuration and editor/emulator screenshots
  for `.RADIX` and `#MEM`. Removed their added help blocks; both features use existing source, compile,
  register and memory views. The in-app quick guide is documented as an existing UI difference.

- **`#MEM` compatibility:** BIN/boot source can initialize memory using hexadecimal physical or segment:offset
  addresses and byte strings. Presets survive reset/reload and remain separate from executable bytes;
  malformed directives and COM use produce diagnostics. Added parser, execution, debugger and browser tests.

- **`.RADIX` compatibility:** source can change the default number base without rewriting literals. Explicit
  suffixes and `0x` take priority, including EMU8086's `123D`/`101B` behavior under base 16. Added source,
  machine-code, execution, diagnostic, and browser tests; see `docs/VERIFICATION_REPORT.md`.

- **Search positioning:** the page title now reads `emu8086-web | Free Online 8086 Emulator & Assembler`. The
  description, social cards and structured data present the app as a browser-based, EMU8086-style alternative
  that works on Linux. The text before the app loads now explains the problem it solves. The interface is
  unchanged.
- **Cloudflare hosting:** the emulator is now served at `https://emu8086.sergiulefter.com/` through Cloudflare
  Workers with a custom domain. GitHub Actions checks source changes without publishing to GitHub Pages.
- **Build consistency:** Node is pinned in `.node-version` for Cloudflare builds and GitHub CI.
- **Windows test portability:** licence and browser-fixture checks now accept Windows line endings.

## 1.0.0 — 2026-10-26

First complete release.

- **Licensed under the MIT License** (`LICENSE`; `"license": "MIT"` in `package.json`). Third-party packages, the
  fonts and quoted or course material keep their own terms; see `docs/THIRD_PARTY_NOTICES.md`.
- **Builds now ship `LICENSES.txt`** with the full licence texts of all bundled packages. The minified bundle
  dropped their licence comments, so the deployed site was missing the MIT notices those packages require.

- **Renamed to emu8086-web** everywhere the name is user-facing: page title, window titles, about and help
  windows, messages, README, docs and package metadata. Saved browser data keeps working; its internal storage
  keys are unchanged.
- **Search and sharing:**
  - page title, description and canonical URL; Open Graph and Twitter cards with a real screenshot
    (`public/og-image.png`, 1200×630)
  - `WebApplication` JSON-LD
  - a real text description in the initial HTML plus a `<noscript>` message
  - favicon files, `robots.txt` and `sitemap.xml`
- **Window titles are headings** (`h1` for the editor, `h2` for the others) for document structure. They look
  exactly the same.
- **README** rewritten for a public audience: features, platforms, use cases, EMU8086 compatibility and an FAQ.
  New `docs/SEARCH_ENGINE_SETUP.md` and `docs/AI_DISCOVERY.md`.
- **Checks:** SEO tests (`tests/unit/seo.test.ts`) and a post-build check (`npm run check:seo`). The deploy workflow
  runs the post-build check before publishing.

- **CPU**: 8086 interpreter covering every opcode and the documented quirks. It passes the full
  SingleStepTests/8088 v2 hardware suite: 323 opcode files, about 2.9 M tests. The EMU8086-accepted 80186 forms
  `PUSH imm`, `PUSHA` and `POPA` are also supported.
- **Assembler**: EMU8086/MASM dialect.
  - Native `0B800h` / `0000_1111b` / `'H'` literals; labels, variables, `DB/DW/DD/DUP`, `EQU`, `PROC/ENDP`, `OFFSET`, `PTR`, `b.`/`w.` and segment overrides.
  - Automatic long conditional jumps and repeated single shifts.
  - Diagnostics with line and column; a source map; symbols and a listing.
  - Encodings cross-checked against GNU objdump.
- **DOS/BIOS**:
  - EMU8086 4.08 memory map: IVT pointing to F400 ROM traps, COM programs at 0700:0100 with a real PSP, and the `RET` → `INT 20h` termination path.
  - BIN and boot loaders.
  - INT 10h/16h/20h/21h services; explicit stops for unsupported services.
- **Video**: 80×25 colour text mode rendered directly from `B8000h`, with CP437 VGA fonts, the BIOS cursor and keyboard input.
- **Debugger**:
  - single step, step over, exact step back, time-sliced run with step delay and instruction limit, break points, run until, set CS:IP
  - editable registers, memory, flags and variables; extended value viewer; stack; symbol table; listing; debug.exe-style commands
- **UI**:
  - EMU8086-style desktop with movable, resizable and overlapping windows: editor, emulator, 80×25 screen, original source, value viewer and tools; task bar; persisted layout.
  - Menus and toolbars follow the decoded 4.08 captions and shortcuts; unsupported controls are visibly disabled.
- **Fixes from the independent code review** (see the verification report): variable differences, CALL to a
  FAR PROC, EQU aliases, BIN entry, `=` redefinition, `RETF n`, step back over INT 21h/0Ch, wait retries, an
  immediate range check, NOT precedence, string equates, and the DUP size limit. Also: step-back history is now
  an O(1) ring buffer, about 2.5 M instructions/s.
- **Tests**:
  - 314 unit and integration tests (acceptance T001–T010, examples, session scheduling, tools, 12 code-review regressions)
  - 32 Playwright end-to-end tests in Chromium and Firefox
  - the optional full conformance run
