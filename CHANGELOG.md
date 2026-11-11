# Changelog

## 1.3.3 — 2026-11-11

- **Programs without `ORG 100h`** (BIN, including `#make_boot#`) are now followed in memory by 20 NOPs and a HLT, as
  in EMU8086 4.08, just like COM programs. Before, the memory list showed `00 NULL` after the program where EMU8086
  shows `90 É` rows and an `F4` (a program that runs past its end now halts there too).

## 1.3.2 — 2026-11-08

- **help → about** links to the project on GitHub (source code, issues and releases). The link opens in a new tab.
- The EMU8086 4.08 trace logs that the step-by-step tests read are now in the repository, so CI passes again.
  `*.log` in `.gitignore` had kept them out since 1.3.0.

## 1.3.1 — 2026-11-08

More EMU8086 4.08 examples from its help and tutorials, plus own test programs, were compiled and single-stepped
in the real EMU8086 and compared step by step. These differences were found and fixed:

- **Bare `ENDP`** (without the procedure name) closes the innermost PROC, as EMU8086 accepts it. Several of its
  examples use it.
- **`PUSH imm`** uses the short form `6A ib` when the value fits in -128..127, and the disassembly shows it as
  `PUSH 03h`.
- **Indirect `JMP`/`CALL`** through memory are disassembled with the `w.` prefix (`CALL w.[BX]`), as in EMU8086.
- **`b.var` / `w.var`** written without a space (`mov b.temp, al`) are accepted.
- **`$3`** is read as `$+3`, as in EMU8086's tutorial (`jmp $3+2`).
- **HLT** leaves IP on the HLT instruction, as in EMU8086.
- **Video memory starts as `00 07`** (NUL characters) instead of spaces, and INT 10h AH=00h clears to `00 07`
  too, as in EMU8086 4.08.
- **`msg: db …`** (a colon label before data) is a label, not a variable: `mov dx, msg` loads its offset, as in
  EMU8086's HelloWorld example.
- **A `DD` variable with a 16-bit register** is a word access (`mov ax, binn`, `mov dx, [binn+2]`), as in the
  double_word example.
- **`OFFSET var[2]`** is the address of var + 2 (the print_char_by_char example).
- **`MOV reg16, SEG var`** assembles as `MOV reg16, CS`.
- **`BYTE PTR` / `WORD PTR` turn off the short accumulator form** (`MOV AL, BYTE PTR w1` is `8A 06 …`).
- **An operand that starts with `(`** is a memory reference (`MOV AX, (2+3)*4` = `A1 14 00`); `-(5)` stays a number.
- **Nested DUP** behaves as in EMU8086: the inner `n DUP(…)` stores just `n`.
- **`HIGH`, `LOW`, `LENGTH`, `SIZE`, `TYPE`, `MOD`, `SHL`, `SHR`, `AND`, `OR`, `XOR` and `NOT` are no longer
  expression operators.** EMU8086 4.08 rejects them with "wrong parameters", and so does emu8086-web now. The
  words are free for your own names, so the cmpsb/cmpsw examples (`size = ($ - x1) / 2`) assemble.
- Tests compare 6 more programs byte for byte with EMU8086 4.08 executables.

## 1.3.0 — 2026-11-04

- **Macros:** `name MACRO p1, p2 … ENDM` and `LOCAL` work as in EMU8086 4.08. Macros must be defined before use.
  Arguments are separated by commas or blanks, and quotes keep a string whole. Parameters are substituted as text,
  case-insensitively, except in the instruction name and inside quotes. Missing arguments are empty and extra ones
  are ignored. `LOCAL x` becomes `X_LOC<n>TMP`, the name EMU8086 gives it. Every byte a call produces belongs to the
  call line, so the source window, break points and error messages point there.
- **`INCLUDE 'emu8086.inc'`:** EMU8086 4.08's library is bundled unchanged, with its copyright notice and a link to
  emu8086.com. PRINT, PRINTN, PUTC, GOTOXY, CURSOROFF, CURSORON and the DEFINE_SCAN_NUM, DEFINE_PRINT_STRING,
  DEFINE_PRINT_NUM, DEFINE_PRINT_NUM_UNS, DEFINE_PTHIS, DEFINE_GET_STRING and DEFINE_CLEAR_SCREEN procedures assemble
  byte for byte as in EMU8086. Other include file names are reported as not found.
- **Unsized memory operands** take EMU8086's default size instead of being an error: a byte with no immediate or
  one in -128..255 (`INC [BX]`, `MOV [DI], 0`), a word otherwise (`MOV [BX], 300`).
- **Doubled quotes** inside a string stay two quote characters, as in EMU8086 (`DB 'it''s'` is `69 74 27 27 73`).
- **Listing window** shows all the bytes of a macro call line, not only its first instruction.
- **Single-stepping matches EMU8086 4.08 step for step.** 12 programs were recorded with EMU8086's debug.exe
  emulation (`r` and `t`), about 830 steps in total: arithmetic, addressing modes, REP strings, flag behaviour,
  INT 21h output, macros and emu8086.inc. Each one now replays with the same registers, flags and next
  instruction at every step.
  - A prefix (`REPE`, `REPNE`, `ES:`, `CS:`, `LOCK`) is its own step and line, and highlights one byte. A REP
    string instruction does one iteration per step and returns to the prefix. Step over (Shift+F8) on a REP
    prefix runs every iteration.
  - Flags the 8086 leaves undefined follow EMU8086: MUL/IMUL keep SF/ZF/AF/PF; logic and shift instructions
    keep AF; right shifts and rotates by more than one bit keep OF; BCD adjustments clear OF; AAA/AAS take SF/ZF
    from AH. EMU8086's DAS (9Bh with CF=0 gives 95h) and its SAHF (which also clears OF, DF and IF) are
    reproduced too.
  - The disassembly uses EMU8086's text: `JZ`, `JNB`, `JNBE`, `JPE`, `JNL`, `JNLE`…; byte values and short
    jumps as `02h`, `035h`, `0115h`; displacements after the brackets (`[BX] + 05h`, `[BP] - 02h`); and the raw
    byte of a sign-extended immediate (`ADD BX, 0FFh`).
  - The debug log adds EMU8086's memory value note (`MOV AL, [BX]		DS:0200=00h`), shows all four bytes of a
    ROM trap, and leaves a blank line after `r` and `t`. `IN` from a port without a device reads 0.
- Tests compare 13 programs byte for byte with executables produced by EMU8086 4.08 and check 7 of its macro error
  cases on the same lines.

## 1.2.1 — 2026-11-03

- **Memory list position:** when the list jumps to follow CS:IP (after loading, or when execution leaves the
  visible rows), the current instruction is now the first row, as in EMU8086 4.08. Previously two rows were kept
  above it.
- **ROM service traps** (`FF FF CD nn`, e.g. INT 20h at `F400:0150`) are listed as EMU8086 4.08 lists them: a
  2-byte `BIOS DI` (two blue rows in the memory list), then `INT 020h` and `IRET` on their own lines. They still
  execute in one step.
- **Disassembly address box** shows CS:IP, an address typed into it, or a fresh selection, as EMU8086 does. It no
  longer shows the first listed line (it read `F400:0150` instead of `F400:0154` after the exit message).

## 1.2.0 — 2026-11-03

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
- **Version from package.json:** the About box (which still said 1.0) and help → check for an update show the
  version from `package.json`. Vite injects it at build time (`src/version.ts`), so the version is set in one place.

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
