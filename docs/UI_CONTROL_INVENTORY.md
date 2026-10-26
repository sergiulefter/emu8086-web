# UI control inventory

This lists every visible or documented EMU8086 4.08 menu item, toolbar button and bottom button, with what
8086 Studio does for it.

Evidence IDs refer to [research/EMU8086_DOC_RESEARCH.md §0](research/EMU8086_DOC_RESEARCH.md):
- **D-EMU, D-COMP, D-START, D-EDIT, D-INT, D-MEM, D-DEBUG, D-TUT**: the official EMU8086 help pages
- **BIN**: captions and accelerators decoded from the 4.08 executable's VB6 form records
- **INI / BINF / TPL / VER**: the 4.08 configuration file, default.binf, code templates and release notes
- **REF-01 … REF-05**: EMU8086 4.08 screenshots used as visual references (not included in this repository)

**Status** is one of:
- **implemented**: works, and is tested where noted
- **disabled**: shown greyed out with a tooltip, for visual fidelity
- **omitted**: not shown (see [KNOWN_UI_DIFFERENCES.md](KNOWN_UI_DIFFERENCES.md))

Confidence is the confidence in the *EMU8086 behaviour* being reproduced.

## Main editor window

### Menu bar `file · edit · bookmarks · assembler · emulator · math · ascii codes · help` (BIN, REF-01, REF-02)

| Menu | Label | Purpose / effect in 8086 Studio | Preconditions | Shortcut | Evidence | Status | Conf. |
|---|---|---|---|---|---|---|---|
| file | new ▸ com template | Replaces the document with the COM template (`org 100h … ret`); asks first if there are unsaved changes | — | — | BIN, TPL | implemented | high |
| file | new ▸ exe template | EXE programs are not supported | — | — | BIN, TPL | disabled | high |
| file | new ▸ bin template | BIN template with `#make_bin#`, `#LOAD_SEGMENT=0500h#` … `HLT` | — | — | BIN, TPL | implemented | high |
| file | new ▸ boot template | `#make_boot#`, `org 7c00h` template (loaded at 0000:7C00) | — | — | BIN, TPL | implemented | high |
| file | new ▸ empty | Blank document | — | — | BIN | implemented | high |
| file | examples ▸ | 10 bundled original examples, including the professor's H and diagonal HELLO | — | — | BIN, D-START | implemented (own example set) | high |
| file | open... | Opens a local `.asm` file (File System Access API in Chrome, file input in Firefox) | — | — | BIN | implemented | high |
| file | save / save as... | Saves the source with CRLF line endings: writes back to the opened file where supported, otherwise downloads | — | — | BIN | implemented | high |
| file | print... | Prints the syntax-coloured source through the browser print dialog | — | — | BIN | implemented | medium |
| file | export to HTML... | Downloads the source as a coloured HTML page | — | — | BIN, VER | implemented (single file) | high |
| file | recent files | Not provided | — | — | BIN | omitted | high |
| file | exit | A browser tab cannot close itself | — | — | BIN | omitted | high |
| edit | undo / redo | CodeMirror history | — | Ctrl+Z / Ctrl+Y | BIN, D-EDIT | implemented | high |
| edit | cut / copy / paste | Clipboard API; Ctrl+X/C/V always work inside the editor | — | Ctrl+X/C/V | BIN, D-EDIT | implemented | high |
| edit | select all | — | — | Ctrl+A | BIN, D-EDIT | implemented | high |
| edit | find... / find next / replace... | CodeMirror search panel | — | Ctrl+F / F3 / Ctrl+H | BIN, D-EDIT | implemented | high |
| edit | go to line... | Opens the go-to-line dialog | — | Ctrl+G | BIN, D-EDIT | implemented | high |
| edit | indent / outdent | Indent or outdent the selected lines | — | Tab / Shift+Tab | BIN, D-EDIT | implemented | high |
| edit | comment block / uncomment block | Adds or removes `;` at the start of the selected lines | — | **Ctrl+Alt+Q / Ctrl+Alt+W** (EMU8086 uses Ctrl+Q/W; browsers reserve those) | BIN, D-EDIT | implemented | high |
| edit | advanced ▸ lowercase / uppercase selection | Changes the case of the selection | — | Ctrl+L / Ctrl+U | BIN | implemented | high |
| edit | advanced ▸ tabify, display whitespace, show line numbers; advanced editor macros ▸ | CodeMax-specific features | — | — | BIN | omitted | high |
| bookmarks | toggle bookmark | Bookmark marker in the gutter | — | Ctrl+F2 | BIN, D-EDIT | implemented | high |
| bookmarks | previous / next bookmark | Cycles through bookmarks | ≥1 bookmark | Shift+F2 / F2 | BIN, D-EDIT | implemented | high |
| bookmarks | jump to first / jump to last / clear all bookmarks | — | — | — | BIN | implemented | high |
| assembler | compile | Assembles and shows the *assembler status* dialog; does not execute | — | — | BIN, D-COMP | implemented (E2E) | high |
| assembler | compile and load in the emulator | Assembles, loads a fresh machine, opens the emulator and original-source windows; on errors shows the status dialog instead | — | F5 | BIN, D-START | implemented (E2E T001) | high |
| assembler | fasm / set output directory... | No external assembler or file-system output folder | — | — | BIN | omitted | high |
| emulator | show emulator | Opens the emulator window (empty if nothing is loaded) | — | — | BIN, D-EMU | implemented | high |
| emulator | assemble and load in the emulator | Same as F5 | — | — | BIN | implemented | high |
| math | multi base calculator | *calculator - expression evaluator* (`~ * / % + - << >> & ^ \|`, result base, signed byte/word interpretation) | — | — | BIN, D-NUM | implemented | high |
| math | base converter | *base convertor* (8/16 bit; HEX, DEC signed/unsigned, OCT, BIN, char) | — | — | BIN, D-NUM | implemented | high |
| ascii codes | (top-level item) | Code page 437 table with decimal, hex and binary codes | — | — | BIN | implemented (layout unverified) | medium |
| help | documentation and tutorials | In-app guide: keys, syntax, services, limitations | — | F1 | BIN | implemented (own content) | high |
| help | check for an update... | Offline application | — | — | BIN | omitted | high |
| help | about... | About box with credits and licences | — | — | BIN | implemented | high |

### Toolbar `new · open · examples▾ · save▾ | compile · emulate | calculator · convertor · options · help · about` (BIN, REF-01, REF-02)

| Label | Effect | Evidence | Status |
|---|---|---|---|
| new | Opens *choose code template* (COM, EXE disabled, BIN, BOOT, empty workspace) | BIN frmChooseTemplate | implemented (E2E) |
| open | Same as file → open... | BIN | implemented |
| examples ▾ | Button opens the first example; the arrow lists all examples | BIN, REF-01 | implemented |
| save ▾ | Button saves; the arrow offers save as... | BIN, REF-01 | implemented |
| compile | Same as assembler → compile | BIN, D-COMP | implemented |
| emulate | Same as F5 | BIN, D-START | implemented |
| calculator / convertor | Open the math tools | BIN | implemented |
| options | Options dialog: step delay, instruction limit per run, auto-show screen, screen font, window layout | BIN ("Font and other Settings") | implemented (own option set) |
| help / about | As in the help menu | BIN | implemented |

**Status bar** (REF-01): `line: N`, `col: N`, the last compile result, and *drag a file here to open*. Dropping
a `.asm` file on the editor opens it. Implemented.

### Assembler status dialog (BIN frmInfo, D-COMP)
- Status list and `(line) message` errors. Clicking an error moves the editor caret to the line and column. **implemented (E2E)**
- **view...**: symbol table, listing, *save executable file...* (downloads the `.com` / `.bin`). **implemented**
- **external...**: **disabled**. **close**: **implemented**. **run**: loads into the emulator. **implemented**

## Emulator window (title `emulator: <name>.com_`, REF-01, REF-04)

### Menu bar `file · math · debug · view · external · virtual devices · virtual drive · help` (BIN, REF-01, REF-02)

| Menu | Label | Effect | Preconditions | Shortcut | Evidence | Status |
|---|---|---|---|---|---|---|
| file | load executable... | `.asm` opens in the editor and emulates; `.com` / `.bin` load raw, without source | — | — | BIN, D-EMU | implemented |
| file | reload | Assembles the current editor source again and restarts it. If assembly fails, the stale program is not run | — | F4 | BIN; see KNOWN_UI_DIFFERENCES.md | implemented (E2E) |
| file | examples ▸ | Loads an example into the editor and emulates it | — | — | BIN | implemented |
| file | reset emulator and ram | Same as the reset button | program loaded | — | BIN | implemented |
| file | set command line parameters; save the emulator's state; load from previous state | — | — | — | BIN | disabled |
| file | close the emulator | Stops Run and closes the window (the machine state is kept) | — | — | BIN | implemented |
| math | multi base calculator / base converter | As in the editor | — | — | BIN | implemented |
| debug | single step | Executes exactly one instruction at CS:IP | program loaded, not terminated | F8 | BIN, D-START | implemented (T001/T003) |
| debug | step over | CALL / INT / LOOP / REP run at full speed until the following instruction | as above | Shift+F8 | BIN, D-ISA | implemented (tests) |
| debug | step back | Exact reversal of the previous instruction (registers, flags, memory, screen, keyboard buffer) | history not empty | F6 | BIN, D-START, VER | implemented (T010) |
| debug | stop on condition... | — | — | — | BIN, D-SOC | disabled |
| debug | run until (address) | Runs until CS:IP reaches the selected disassembly line | program loaded | Ctrl+F8 | BIN | implemented (tests) |
| debug | run / stop | Run toggle and explicit stop | — | F9 / — | BIN | implemented |
| debug | set break point / clear break point / show current break point | Break points at the selected line. Several are allowed; EMU8086 allows one | — | — | BIN | implemented (E2E) |
| debug | show current instruction (at CS:IP) | Re-anchors the memory and disassembly lists at CS:IP | — | F7 | BIN | implemented |
| debug | set CS:IP to selected position | Sets IP to the selected line (within the current CS) | a line is selected | Ctrl+Shift+F7 | BIN | implemented |
| view | log and debug.exe emulation | Debug log window | — | F11 | BIN, VER | implemented |
| view | extended value viewer, stack, variables, memory, symbol table, listing, original source code, options, flags, lexical flag analyzer, ascii codes, emulator screen | Open the corresponding windows | — | — | BIN | implemented |
| view | arithmetic & logical unit | — | — | — | BIN | disabled |
| external | start debug.exe / command prompt / run (external) | Not possible from a browser | — | (F12) | BIN | disabled |
| virtual devices | (device list) | Virtual devices are outside the course scope | — | — | BIN, D-TUT12 | disabled placeholder |
| virtual drive | boot from virtual floppy, write boot sector, write .bin to floppy, create new floppy drive | — | — | — | BIN | disabled |
| help | documentation and tutorials / about... | As in the editor | — | F1 | BIN | implemented |

### Toolbar (BIN, REF-01, REF-02, REF-04)
| Label | Effect | Status |
|---|---|---|
| Load | file → load executable... | implemented |
| reload | As above | implemented |
| step back | Disabled until there is history | implemented (E2E T010) |
| single step | Executes one instruction | implemented |
| run | **Toggle** (`aria-pressed`): auto-steps with the step delay, or at full speed in 12 ms batches at delay 0; click again to stop | implemented (E2E T002/T008) |
| step delay slider, *step delay ms: N* | 0–400 ms in 10 ms steps (EMU8086's range is unverified); options allow up to 2000 ms | implemented |

### Main area
| Element | Behaviour | Status |
|---|---|---|
| registers group (AX/BX/CX/DX as H/L; CS IP SS SP BP SI DI DS ES) | Hex, editable (type and press Enter); values changed by the last action are shown in blue; double-click opens the extended value viewer | implemented (E2E) |
| memory list + address box | One row per byte, `PPPPP: HH DDD c` (physical address, hex, decimal, CP437 char or `NULL` / `RES` / …). The current instruction's first byte is shown in blue, the rest in yellow. The box accepts `seg:off`, `DS:[BX+2]`, `CS:IP`, variable names or a physical address; double-click opens the value viewer on that word | implemented (E2E) |
| disassembly list + address box | EMU8086 format (`MOV AX, 0B800h`, `INT 020h`, `BIOS DI 020h` for ROM traps). Follows CS:IP. Click selects; double-click or right-click sets break points; wheel or arrow keys scroll | implemented |
| status line | ready / running (count) / waiting for keyboard input / stopped reason; source line; instruction count | implemented (addition, see differences) |

### Bottom buttons `screen · source · reset · aux · vars · debug · stack · flags` (BIN, REF-01)
| Label | Effect | Status |
|---|---|---|
| screen | Shows the emulator screen | implemented |
| source | Shows the original source code window | implemented |
| reset | Restores the IVT, clears the screen and RAM, reloads the program | implemented (E2E T008) |
| aux | Popup: memory (tabled viewer/editor), symbol table, listing; ALU, FPU and stop on condition are disabled | implemented |
| vars | Variables window: size, elements, show as (hex/bin/octal/signed/unsigned/ascii), **edit** (accepts `5, 0Ah, 'text'`) | implemented |
| debug | Debug log: `r`, `r reg val`, `rf`, `t`, `p`, `d`, `u`, `e`, `?`, `cls`; logs port I/O | implemented (unit tests) |
| stack | Words from SS:SP-8 to SS:SP+64, with `<` marking the top | implemented (row format unverified) |
| flags | 8 editable checkboxes CF ZF SF OF PF AF IF DF plus **analyse** (lexical flag analyser) | implemented |

## Other windows
| Window | Behaviour | Evidence | Status |
|---|---|---|---|
| emulator screen (80x25 chars) | Canvas rendered from RAM at B8000h; CP437; 16 colours; BIOS cursor; typing sends keys to the BIOS keyboard buffer. **clear screen**, **change font** (VGA 9×16 / 8×16 / EGA 8×14), buffer indicator `n/15` (click to flush) | REF-02, REF-04, D-MEM, VER | implemented (E2E) |
| original source code | Read-only, syntax-coloured, with line numbers. The next line to execute is shown in yellow; the last program line stays highlighted while in the PSP or ROM. Click a line number to toggle a break point | REF-01, REF-04, D-COMP | implemented (E2E T003) |
| extended value viewer | watch (registers or MEM seg:off), word/byte; H/L hex, bin, oct; decimal 8-bit unsigned/signed/ascii; decimal 16-bit; every field is editable | REF-01, D-EMU | implemented (E2E T009) |
| message | *PROGRAM HAS RETURNED CONTROL / TO THE OPERATING SYSTEM*, *the emulator is halted.*, *break point encountered at:*, unsupported-service and limit messages; OK | REF-04, BIN | implemented (E2E) |
| program terminated → reload? | Shown when stepping or running after termination | BIN | implemented |
