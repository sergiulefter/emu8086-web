# UI evidence matrix

This table maps each non-trivial behaviour to the documentary evidence for it, then to the reference screenshot
that guided its appearance, then to the implementation and the test that checks it. The evidence IDs are defined
in [research/EMU8086_DOC_RESEARCH.md](research/EMU8086_DOC_RESEARCH.md).

| Behaviour | Documentary evidence | Reference screenshot (appearance) | Implementation | Verified by |
|---|---|---|---|---|
| Emulate compiles and loads, then waits; nothing runs until step/run | D-START §2, D-EMU | REF-01 | `store.emulate`, `Machine.load` | e2e T001 |
| COM loads at 0700:0100, SS:SP=0700:FFFE, [FFFE]=0000, CX=size | D-TUT03/09, IMG emulator03 | REF-04 (SS/ES=0700) | `DosEnvironment.loadCom` | integration T001 |
| Final RET → PSP INT 20h → F400:0150 → stop at F400:0154, SP=FFFA | D-MEM IVT, ROM bytes, D-TUT09 | REF-04 (CS=F400, IP=0154, SP=FFFA) | ROM stubs + CPU trap | integration T001, e2e T001 |
| Termination message box text | BIN string | REF-04 | `store.onSessionEvent` | e2e T001/T002 |
| HLT → "the emulator is halted." | BIN | — | `Machine.step` | integration + e2e T004c |
| Memory list shows physical addresses `PPPPP: HH DDD c` | VER 4.02, IMG emulator03 | REF-01, REF-04 (`F4160: FF 255 RES`) | `MemoryList` | e2e T003, visual |
| Current instruction bytes highlighted (first blue, rest yellow) | IMG emulator03 | REF-01 | `MemoryList` | visual |
| Disassembly in `MOV AX, 00003h` / `INT 010h` style, BIOS traps as `BIOS DI` | IMG emulator03, D-MEM | REF-01 | `disasm.ts` | unit round-trip |
| Registers editable, changed values shown in blue | D-EMU, VTS Fig 14 | REF-04 (IP blue) | `Registers` | e2e T009 (edit) |
| Double-click register or memory → extended value viewer | D-EMU | REF-01 | `store.setWatch` | e2e T009 |
| Extended value viewer fields | BIN frmExtendedViewer, VTS | REF-01 (AX=00F7: -9, ≈, 247) | `ValueViewer` | e2e T009 |
| Run is a toggle with step delay in ms | BIN chkAutoStep, D-EMU | REF-01 (run focused, "step delay ms: 0") | `EmulatorSession` | e2e T002/T008 |
| Step back greyed out without history; F6 | BIN, D-START, VER | REF-01 (greyed after load), REF-02 | `Machine.stepBack` | e2e T010 |
| Reset restores IVT, clears the screen and reloads | BIN tooltip | REF-01 | `Machine.reset` | e2e T008 |
| Original source window; highlighted line = next to execute; stays on RET after exit | VTS p.3, D-COMP | REF-01 (yellow), REF-04 (RET yellow after exit) | `SourceWindow`, `Machine.lastLine` | e2e T003, integration |
| Emulator screen `emulator screen (80x25 chars)` with clear screen, change font, keyboard buffer indicator (`n/15` here, `n/16` in EMU8086) | BIN, VER, D-MEM | REF-02, REF-04 | `ScreenWindow` | e2e T001/T002, keyboard test |
| Screen shown automatically on output and after stop | INI ACTIVATE_SCREEN(_WHEN_STOPPED) | REF-02/04 | `store.onSessionChange` | e2e T001 |
| Flags window: 8 editable checkboxes + analyse | BIN frmFLAGS, D-EMU | — | `FlagsWindow`, `LexFlagsWindow` | e2e menus |
| Stack window marks top with `<` | D-TUT09 | — | `StackWindow` | visual |
| Variables window: size / elements / show as / edit | BIN frmVars, D-TUT03 | — | `VarsWindow` | visual |
| Debug log commands d, t, p, r, rf | D-DEBUG | — | `debugCommands.ts` | unit |
| Assembler status dialog with `(line) message` errors | BIN frmInfo, D-COMP | — | `StatusDialog` | e2e T005 |
| Out-of-range Jcc → opposite jump + JMP | D-TUT07, VER 4.02 | — | `encodeJcc` | unit |
| `ROL AL, 5` → five single shifts | D-COMP | — | `encodeShift` | unit |
| Binary literal with `_`, hex needs a leading digit | D-NUM, D-TUT02 | REF-02 (`0000_1111b`) | `lexer.ts` | unit, T005 |
| Case-insensitive symbols | D-TUT03 | — | assembler | unit |
| Strict operand-size checking | INI STRICT_SYNTAX=true | — | `memSize` | unit |
| Menu captions and shortcuts (F5, F8, Shift+F8, F6, F9, F4, F7, Ctrl+F8, F11, F1) | BIN accelerators | REF-01/02 | `EditorWindow`, `EmulatorWindow`, `App` | e2e menus, T001 (F5/F8) |
| Editor colours: blue mnemonics, maroon registers, green comments | — (visual only) | REF-01, REF-02, REF-03 | `asmEditor.ts` | visual |
| Windows 10 frames around VB6 classic 3D controls | — (visual only) | REF-01, REF-04 | `styles.css` | visual |
