# 8086 Studio

A locally hosted 8086 assembler, emulator and debugger that runs in your browser and works like
**EMU8086 4.08**, the program used in the course. You can paste the professor's programs unchanged, press
**emulate**, step through them instruction by instruction, and watch the 80×25 text screen at `B800:0000`.
A program that ends with `RET` returns to DOS and shows *PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM*.

Everything runs inside the browser tab. You do not need a server, an account, Docker, Electron or a `.deb`
package, and the app makes no network requests once its dependencies are installed.

![Professor's H program after six single steps](docs/screenshots/02-professor-H-stepped.png)

## Install and start (Linux)

Requirements: **Node.js 20 or newer** and npm. Node 22 LTS was used for testing.

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in Firefox or Chrome.

To serve the optimised build instead:

```bash
npm run build
npm run preview        # http://localhost:4173
```

## Using it

1. Paste or type your program in the editor. Templates are under **new**, sample programs under **examples**,
   and you can also drag a `.asm` file onto the editor.
2. Press **emulate** (F5). This assembles the program and loads it into the **emulator** window. The
   **original source code** window opens too, with the next line to execute highlighted in yellow.
3. Use **single step** (F8), **step back** (F6) and **run** (F9). Run is a toggle, as in EMU8086. The **step delay**
   slider slows Run down. The **emulator screen** opens by itself as soon as the program writes to video memory.
4. Double-click a register or memory byte to open the **extended value viewer**. The bottom buttons open the
   **screen, source, reset, aux, vars, debug, stack** and **flags** windows.
5. If the program waits for a key, click the emulator screen and type.

Every window can be moved, resized, minimised, maximised and closed. Minimised windows come back from the
task bar at the bottom. The task bar's **windows** button can cascade or tile all windows, or reset the layout.
The app remembers the window layout and your current source between visits, using browser storage.

| Key | Action | Key | Action |
|---|---|---|---|
| F5 | compile and load in emulator | F9 | run / stop |
| F8 | single step | Shift+F8 | step over |
| F6 | step back | Ctrl+F8 | run until selected line |
| F4 | reload | F7 | show current instruction |
| F11 | debug log (debug.exe commands) | F1 | help |

## Tests

```bash
npm test                 # unit + integration tests (Vitest): assembler, CPU, DOS, acceptance T001–T010
npx playwright install chromium firefox   # once, downloads browsers for the UI tests
npm run test:e2e         # browser tests in Chromium and Firefox (starts its own dev server)
npm run test:conformance # optional: downloads ~730 MB of hardware-captured 8088 tests and runs them all
npm run typecheck
```

[docs/VERIFICATION_REPORT.md](docs/VERIFICATION_REPORT.md) lists the latest results.

## What is supported

- **CPU:** the complete 8086 instruction set, including undocumented aliases. It passes all 323 opcode files of
  the SingleStepTests/8088 hardware suite. The four 80186 forms that EMU8086 accepts (`PUSH imm`, `PUSHA`,
  `POPA`) also work, with a warning.
- **Assembler:** EMU8086/MASM syntax, including `0B800h`, `0000_1111b`, `'H'`, labels, variables, `DB/DW/DD/DUP`,
  `EQU`, `PROC/ENDP`, `OFFSET`, `BYTE PTR` / `b.` / `w.` and segment overrides. Out-of-range conditional jumps are
  extended automatically. Errors report the line and column.
- **DOS/BIOS:**
  - `.COM` programs load at `0700:0100` with a real PSP and return through `INT 20h`.
  - `.BIN` and boot images load as EMU8086 loads them.
  - Implemented services: INT 21h (01, 02, 06–0C, 25, 2A, 2C, 35, 4C, 00), INT 10h text-mode services, and
    INT 16h, 20h, 11h, 12h, 15h/86h and 1Ah.
  - Unsupported services stop with an explicit message.
- **Debugger:**
  - single step, step over, exact step back (50 000 steps), run with a delay, break points and run until
  - registers, memory, disassembly, stack, flags and variables, all editable
  - symbol table, listing, and a debug.exe-style command window

[docs/SUPPORT_MATRIX.md](docs/SUPPORT_MATRIX.md) has the full support matrix.
[docs/KNOWN_UI_DIFFERENCES.md](docs/KNOWN_UI_DIFFERENCES.md) covers known limitations and differences from EMU8086.

## Project layout

```
src/assembler/     lexer, expression/operand parser, multi-pass encoder (source map, diagnostics)
src/cpu/           8086 interpreter, 1 MiB memory with write journal, disassembler
src/dos/           IVT/ROM stubs, BIOS data area, PSP, COM/BIN loaders, INT 10h/16h/21h… services
src/devices/vga/   80x25 colour text mode over RAM at B8000h, CP437, CGA palette
src/debug/         Machine (atomic step + step back), session scheduler, calculator, debug commands
src/ui/            React desktop: window manager, menus, editor (CodeMirror 6), emulator windows
src/examples/      bundled example programs and code templates
tests/             unit, integration (acceptance T001–T010), e2e (Playwright), conformance
fixtures/          the professor's programs and other acceptance fixtures, unchanged
docs/              architecture, ADRs, UI inventory/evidence, support matrix, verification report
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the modules fit together
- [docs/adr/](docs/adr/): architecture decision records ADR-001 to ADR-006
- [docs/UI_CONTROL_INVENTORY.md](docs/UI_CONTROL_INVENTORY.md) and [docs/UI_EVIDENCE_MATRIX.md](docs/UI_EVIDENCE_MATRIX.md): every
  menu and toolbar control, its documented EMU8086 behaviour, and whether it is implemented
- [docs/research/EMU8086_DOC_RESEARCH.md](docs/research/EMU8086_DOC_RESEARCH.md): the sourced research behind them
- [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md): libraries, fonts and test data with their licences
- [CHANGELOG.md](CHANGELOG.md)

8086 Studio is not affiliated with EMU8086 or its authors. It contains no EMU8086 code, binaries, icons or
library files; all artwork is original.
