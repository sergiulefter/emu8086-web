# EMU8086 4.08 — Documentation-first UI and behaviour inventory

Research date: 2026-10-26. Scope: research only, no code. Every row gives an evidence ID (see §0) plus a section, page or figure, and a confidence level.

**Confidence legend**
- **high**: stated explicitly in EMU8086's own documentation, or read directly from the 4.08 program resources (exact caption or shortcut) with nothing contradicting it.
- **medium**: shown in a screenshot, read from 4.08 resources without documentation of the behaviour, or a strong inference from two independent sources.
- **low**: an inference from indirect evidence, or a single weak or old source.
- **UNVERIFIED**: I could not find evidence. Do not treat these as facts.

---

## 0. Sources consulted (verified 2026-10-26)

| ID | Source | Status | Version / notes |
|---|---|---|---|
| D-EMU | https://surendrajat.github.io/emu8086/documentation/emulator.html | 200 OK | Official EMU8086 help (4.x era), mirrored on GitHub Pages |
| D-COMP | https://surendrajat.github.io/emu8086/documentation/compiler.html | 200 OK | same |
| D-START | https://surendrajat.github.io/emu8086/documentation/start_unframed.html | 200 OK | same |
| D-HELP | https://surendrajat.github.io/emu8086/documentation/help.html (index.html is a frameset of menu.html + help.html) | 200 OK | doc index |
| D-EDIT | …/documentation/editor.html | 200 OK | editor mouse and hot keys |
| D-MEM | …/documentation/memory.html | 200 OK | global memory table, IVT, system info area |
| D-CMM | …/documentation/custom_memory_map.html | 200 OK | |
| D-INT | …/documentation/8086_bios_and_dos_interrupts.html | 200 OK | supported-interrupt list |
| D-ISA | …/documentation/8086_instruction_set.html | 200 OK | |
| D-DEBUG | …/documentation/debug.html | 200 OK | "debug" window command set |
| D-SOC | …/documentation/stop_on_condition.html | 200 OK | |
| D-COMPAT | …/documentation/compatibility.html | 200 OK | MASM/TASM compatibility |
| D-IO | …/documentation/io.html | 200 OK | I/O ports, devices, HW interrupts |
| D-NUM | …/documentation/numbering_systems_tutorial.html | 200 OK | literals, Math menu |
| D-TUT01…D-TUT12 | …/documentation/asm_tutorial_01.html … asm_tutorial_12.html | 200 OK | Tutorials. Screenshots in TUT03 show an **older** build (segment 0B56) |
| D-REQ / D-REF / D-START2 | requirements.html, reference.html, start.html | 200 OK | `start.html` is the licensing page, not a tutorial |
| (missing) | `_documentation_index.html`, `_readme.txt` are in the repo listing but return 404 on Pages | 404 | — |
| MIRROR | https://andreagennaioli.github.io/emu8086-documentation/emulator.html (also checked compiler, memory, interrupts, debug, help) | 200 OK | Lightly re-edited copy of D-*. Wording differs (capitalisation, the "operating system tutorial" link is commented out, delete-floppy wording). **No substantive behavioural differences found.** |
| VER | https://github.com/surendrajat/emu8086/blob/master/version.txt | 200 OK | **Release notes 4.02 → 4.08.** Top entry: "Version 4.08 — Fix for ADC and SBB emulation". Key source for 4.x features. |
| INI | …/emu8086/blob/master/emu8086.ini | 200 OK | Shipped configuration with comments |
| BINF | …/emu8086/blob/master/default.binf | 200 OK | Default .BIN load and register settings |
| TPL | …/emu8086/tree/master/inc (`0_com_template.txt`, `1_exe_template.txt`, `2_bin_template.txt`, `3_boot_template.txt`) | 200 OK | Templates for "new" |
| ROM | …/emu8086/blob/master/BIOS_ROM, …/INT_VECT | 200 OK | Bytes inspected with xxd only |
| BIN | …/emu8086/blob/master/emu8086.exe. PE FileVersion **4.00.0008** (= 4.08), SHA-256 `dba99f7c…a055e9` | 200 OK | **Not executed.** I extracted VB6 form/menu captions and decoded the menu `Shortcut` bytes (index → key table; checked against documented F5/F8/F6/Shift+F8/Ctrl+Q/Ctrl+W/F1, which all match). Gives exact labels and shortcuts, but not behaviour. Third-party GitHub upload of the install folder. |
| IMG-* | Doc screenshots, e.g. https://surendrajat.github.io/emu8086/documentation/img/emulator03.gif, compile01.gif, compile03.gif, emulator02.gif, screen01.gif, varview.gif, num12.gif, write_bin_menu.png, white_boot_sector.png, write_bin.gif, tut3a.gif | 200 OK | emulator02/03 match the 4.08 layout. write_bin_menu / white_boot_sector come from a **4.0x build that has "alu"/"log" buttons and a "memory at:" box**. tut3a is older still (0B56). |
| PHIL | https://www.philadelphia.edu.jo/academics/qhamarsheh/uploads/emu8086.pdf | 200 OK (191 pp) | **This is the Emu8086 v3.07 help** (web-capture path `Emu8086v3.07/Help/…`, 2006). Older UI: bottom buttons "User Screen / Actual Source / ALU / Stack / FLAGS", no step back, COM at 0B56, "Samples" menu. pp. 158–159 show emulator screenshots. |
| VTS | https://people.vts.su.ac.rs/~pmiki/ASM_old/ASM%20zbirka/Emu8086%20tutorial.pdf | 200 OK (9 pp, 2009) | Lab guide with screenshots of an older 3.x/4.0x-style UI ("Choose Template for New File" with 4 options, "Actual Emulated Source Code", Extended Value Viewer with Watch combo, COM at 0B56) |
| UON | https://uoninevah.edu.iq/ee/wp-content/uploads/sites/3/2023/09/مختبر-معالجة-الاشارة-الرقمية.pdf | **404** (also with http:// and www.). The site root https://uoninevah.edu.iq/ee/ answers 200. | **Not available.** A web search found no copy. Nothing in this document relies on it. |
| WEB | Web searches for 0700:0100, step delay range and menu listings | — | Turned up nothing more authoritative than the sources above |

**Version caution.** The online documentation (D-*) is the 4.x help, but several of its screenshots and all of PHIL/VTS show older builds. Where captions differ, BIN (the actual 4.08 executable) wins for labels, and D-*/VER win for behaviour.

---

## 1. Editor (main window) menus — EMU8086 4.08

Top-level menu bar, left to right (BIN; matches IMG compile01.gif, which shows `file edit bookmarks assembler emulator math help`; 4.08 adds a clickable top-level **ascii codes**): **file · edit · bookmarks · assembler · emulator · math · ascii codes · help**. Captions are lower-case in 4.08. Confidence **high** (BIN). Nesting was decoded from the VB6 form records.

Shortcuts: a "SC" in the Shortcut column is a real menu accelerator decoded from BIN. A "caption text" shortcut is only typed into the caption string (the menu has no accelerator; the CodeMax editor control handles the key, see D-EDIT).

### 1.1 file
| Item | Sub-items | What it does | Shortcut | Evidence | Conf. |
|---|---|---|---|---|---|
| new ▸ | com template, exe template, bin template, boot template, empty | Opens a new source from `c:\emu8086\inc\N_xxx_template.txt`. "empty" opens a blank workspace. Template texts are in §2.2. | — | BIN; TPL; D-COMP ("Select Clean from the New menu…" — older name for "empty"); D-TUT11 ("BIN Template from File → New") | high |
| ─ | | | | | |
| examples ▸ | Hello, world · add / subtract · calculate sum · compare numbers · binary, hex and octal values · traffic lights · palindrome · LED display test · stepper motor · simple i/o · more examples... | Opens a bundled sample from `c:\emu8086\examples`. "more examples..." opens a file browser on that folder. | — | BIN; D-START ("click examples and browse c:\emu8086\examples") | high (labels); medium ("more examples..." behaviour) |
| ─ | | | | | |
| open... | | Open a source file. Files with ASCII_EXTENTIONS open in the editor; binaries go to the emulator. | — (no menu accelerator in BIN) | BIN; INI `ASCII_EXTENTIONS`; VER 4.02 | high / medium |
| ─ | | | | | |
| save | | Save the source | — | BIN | high |
| save as... | | | — | BIN | high |
| ─ | | | | | |
| print... | | Prints directly. A one-time warning recommends exporting to HTML instead. | — | BIN (string "Direct print may not be correct… export to HTML") | medium |
| export to HTML... | | Opens the "export to HTML" dialog: title, description, font, margin, file-name-on-top, "asm2html hyperlink", export / export all files with index.html | — | BIN; VER 4.02 ("file->export to html") | high |
| ─ | | | | | |
| (recent files) | Recent 1 … Recent N | MRU list, up to 20 (INI `RECENT_FILES`, max 20) | — | BIN; INI | high |
| ─ | | | | | |
| exit | | Quit | — | BIN | high |

### 1.2 edit
| Item | Sub-items | Purpose | Shortcut | Evidence | Conf. |
|---|---|---|---|---|---|
| undo | | | Ctrl+Z, Alt+Backspace (editor control) | BIN; D-EDIT | high |
| redo | | | UNVERIFIED (not in D-EDIT table) | BIN | high (label) |
| ─ | | | | | |
| cut | | | Ctrl+X, Shift+Del, Ctrl+Alt+W | BIN; D-EDIT | high |
| copy | | | Ctrl+C, Ctrl+Ins | BIN; D-EDIT | high |
| paste | | | Ctrl+V, Shift+Ins | BIN; D-EDIT | high |
| ─ | | | | | |
| select all | | | Ctrl+A | BIN; D-EDIT | high |
| ─ | | | | | |
| find... | | Find (regex-style wildcards, see D-EDIT) | caption "Ctrl+F" (also Alt+F3) | BIN; D-EDIT | high |
| find next | | | caption "F3" | BIN; D-EDIT | high |
| replace... | | | caption "Ctrl+H" (also Ctrl+Alt+F3) | BIN; D-EDIT | high |
| ─ | | | | | |
| go to line... | | | caption "Ctrl+G" | BIN; D-EDIT | high |
| ─ | | | | | |
| indent | | | caption "Tab" | BIN; D-EDIT | high |
| outdent | | | caption "Shift+Tab" | BIN; D-EDIT | high |
| ─ | | | | | |
| comment block | | Prefix the selected lines with `;` | **SC Ctrl+Q** | BIN; D-EDIT; VER 4.02 | high |
| uncomment block | | | **SC Ctrl+W** | BIN; D-EDIT; VER | high |
| ─ | | | | | |
| advanced editor macros ▸ | Play Macro 1 … Play Macro 10 · ─ · Repeat Next Command... (caption Ctrl+R) · ─ · Record new Keystroke Macro | CodeMax keystroke macros | see captions | BIN | high (labels), low (relevance) |
| advanced ▸ | show line numbers · ─ · tabify selection · untabify selection · ─ · lowercase selection (caption Ctrl+L) · uppercase selection (caption Ctrl+U) · ─ · display whitespace | | D-EDIT: Tabify Ctrl+Shift+T, Untabify Ctrl+Shift+Space, Display Whitespace Ctrl+Alt+T | BIN; D-EDIT | high |

D-EDIT also lists editor-control keys that have no menu item (Cut Line Ctrl+Y, Go To Match Brace Ctrl+], Select Line Ctrl+Alt+F8, Toggle Overtype Ins, word/line navigation, etc.). Copy that table from D-EDIT if you need the full list.

### 1.3 bookmarks
| Item | Shortcut | Evidence | Conf. |
|---|---|---|---|
| toggle bookmark | caption "Ctrl+F2" | BIN; D-EDIT | high |
| ─ | | | |
| previous bookmark | caption "Shift+F2" | BIN; D-EDIT | high |
| next bookmark | caption "F2" | BIN; D-EDIT | high |
| ─ | | | |
| jump to first | — | BIN | high |
| jump to last | — | BIN | high |
| ─ | | | |
| clear all bookmarks | — | BIN | high |

### 1.4 assembler
| Item | Purpose | Shortcut | Evidence | Conf. |
|---|---|---|---|---|
| compile | Assemble and save the executable. Shows the "assembler status" dialog (§2.3). | — | BIN; D-COMP | high |
| compile and load in the emulator | Assemble, save to MyBuild, open the emulator with the program loaded | **SC F5** | BIN; D-START ("click emulate (or press F5)"); D-TUT07 ("F5 hotkey to recompile and reload") | high |
| fasm | Use the Flat Assembler instead (equivalent to the `#fasm#` directive) | — | BIN; VER (FASM integration) | medium |
| ─ | | | | |
| set output directory... | Dialog with path and "use default [emu8086\MyBuild] directory" | — | BIN | high |

### 1.5 emulator
| Item | Purpose | Shortcut | Evidence | Conf. |
|---|---|---|---|---|
| show emulator | Open the emulator with nothing loaded, so you can load an existing executable | — | BIN; D-EMU ("Select Show emulator from the Emulator menu"); IMG write_bin_menu.png ① | high |
| assemble and load in the emulator | Same as compile and load in the emulator | — (only the assembler-menu copy has the F5 accelerator) | BIN; IMG write_bin_menu.png ① (caption "compile and load in emulator" in that older build) | high |

### 1.6 math
| Item | Window opened | Evidence | Conf. |
|---|---|---|---|
| multi base calculator | **"calculator - expression evaluator"**. Text area where you type an expression and press Enter. Radio "show result as" (decimal / hex / oct / bin), group "treat hex,oct,bin as:" with a **signed** checkbox and **word/byte** radios, plus **clear** and **help** buttons. Help opens "calculator help", the operator list `~ * / % + - << >> & ^ |`. Works with values up to 32 bits; double words are always signed. | BIN (frmEvaluator); D-NUM (end section); IMG num12.gif | high |
| base converter | **"base convertor"**. 8 bit / 16 bit radios; HEX, DEC signed and unsigned, ASCII char, OCT and BIN boxes. Typing in any box updates the others. | BIN (frmBaseConvertor); D-NUM; IMG num12.gif | high |

Note the spelling: the menu says "base converter", while the window title and toolbar button say "convertor".

### 1.7 ascii codes (top-level, no children)
Opens the "ascii codes" character table window (frmASCII_CHARS). Evidence: BIN. Confidence **high** that it exists, **UNVERIFIED** layout. There is also an "ascii codes" item in the emulator's view menu.

### 1.8 help
| Item | Shortcut | Evidence | Conf. |
|---|---|---|---|
| documentation and tutorials | **SC F1** | BIN | high |
| ─ | | | |
| check for an update... | — | BIN; D-TUT07 ("help-> check for an update") | high |
| ─ | | | |
| about... | — | BIN ("about emu8086" dialog: version, FASM 1.64 credit, Barry Allyn CodeMax credit, registration) | high |

---

## 2. Editor toolbar, "new", compile output

### 2.1 Toolbar buttons (left to right)
From BIN (`Toolbar1` button keys `new, open, examples/samples, save, saveas, compile, emulate, calculator, convertor, options, help, about`) and IMG compile01.gif, which shows the labels "new | open | examples ▾ | save ▾ | compile | emulate | calculator | convertor | options | help | about" with separators after `save` and `emulate`.

| Button | Action | Evidence | Conf. |
|---|---|---|---|
| **new** | Opens the "choose code template" dialog (§2.2) | BIN (cmdNew "New Source Code"; frmChooseTemplate); VTS p.1 Fig 3–4 | high |
| **open** | Open file | BIN ("Open Source Code"); IMG compile01 | high |
| **examples** (dropdown ▾) | Dropdown of the same example list as file → examples | IMG compile01 (dropdown arrow); BIN | high |
| **save** (dropdown ▾) | Save. The dropdown holds "Save as..." (key `saveas`). | IMG compile01; BIN | high (button), medium (dropdown contents) |
| **compile** | Assemble to an executable and show the assembler status dialog. "You will be asked for a place where to save the compiled file." | D-COMP; BIN ("Compile the Source Code and build an executable") | high |
| **emulate** | Compile and load into the emulator (= F5). Saves to `c:\emu8086\MyBuild` without asking. | D-START §2; D-EMU; BIN ("Compile Source Code and Load it into the Emulator") | high |
| **calculator** | Opens the multi base calculator (expression evaluator) | BIN; IMG num12 | high |
| **convertor** | Opens the base convertor | BIN; IMG num12 | high |
| **options** | Opens "options": editor/font/colour settings (§2.4) | BIN ("Font and other Settings") | high |
| **help** | Documentation & Tutorials | BIN | high |
| **about** | About box & home-page URL | BIN | high |

The status bar sits at the bottom of the editor. IMG compile01 shows the current line number there, e.g. "4". **medium**.

### 2.2 What "new" offers
The **4.08 dialog "choose code template"** (BIN frmChooseTemplate) has option buttons, OK/Cancel and a checkbox:

| Option caption (exact, 4.08) | Template file / result | Conf. |
|---|---|---|
| COM template - simple and tiny executable file format, pure machine code. | `0_com_template.txt` | high |
| EXE template - advanced executable file. header: relocation, checksum. | `1_exe_template.txt` | high |
| BIN template - pure binary file, allows all sorts of customizations (advanced) | `2_bin_template.txt` | high |
| BOOT template - for creating floppy disk boot records (very advanced) | `3_boot_template.txt` | high |
| empty workspace | blank editor | high |
| "the emulator" (a 6th option control exists in BIN; likely "open the emulator only") | UNVERIFIED whether it is visible | low |
| checkbox: "use Flat Assembler / Intel syntax [see: fasm_compatibility.asm in examples]" | uses the `fasm_N_*_template.txt` variants | medium |

Older builds (VTS p.1 Fig 4) titled the dialog "Choose Template for New File" with only COM/EXE/BIN/BOOT. The 3.x docs said "Clean" (D-COMP) where 4.08 says "empty".

**Template contents** (TPL, verbatim gist, **high**):
- **COM**: comment header, `org 100h`, `; add your code here`, `ret`.
- **EXE**: `data segment` (with `pkey db "press any key...$"`) `ends`; `stack segment` `dw 128 dup(0)` `ends`; `code segment`, `start:` `mov ax, data / mov ds, ax / mov es, ax`, then `lea dx, pkey / mov ah, 9 / int 21h`, `mov ah, 1 / int 21h`, `mov ax, 4c00h / int 21h`, `ends`, `end start`.
- **BIN**: `#make_bin#`, `#LOAD_SEGMENT=0500h#`, `#LOAD_OFFSET=0000h#`, `#CS=0500h#`, `#IP=0000h#`, `#DS=0500h#`, `#ES=0500h#`, `#SS=0500h#`, `#SP=FFFEh#`, `#AX=0000h#` … `#BP=0000h#`, then `HLT`.
- **BOOT**: a long comment, then `#make_boot#`, `org 7c00h`, then `INT 19h ; reboot`.
- An empty new file contains `; add your code here` (BIN string; **medium**). The default file name is `noname` / `mycode.asm` (BIN; **medium**).

### 2.3 What compile produces, and the compile-status dialog
**Output files** (D-COMP "When saving an assembled file…", **high**):
- The executable: `.com` / `.exe` / `.bin`. When it isn't manually saved, the emulator uses `.com_`, `.exe_`, `.bin_` (VER 4.02).
- `*.~asm`: copy of the original source, so the emulator can show the source.
- `*.debug`: maps machine code to source lines.
- `*.symbol`: symbol table used by the "variables" window (plain text).
- `*.binf`: only for BIN/BOOT output (load address and registers, §7.3).
- `*.list`: listing file. Generated automatically unless `LISTING=false` (VER 4.02; INI).

**Output-type selection** (D-COMP, **high**): use `#make_com#`, `#make_exe#`, `#make_bin#` or `#make_boot#`. Without one, the type is inferred: `org 100h` → COM, a stack segment → EXE. Only when it cannot determine the type does it ask. BIN strings show the ask dialog: "make EXE / make BIN / make BOOT — Output file type for compiler".

**Dialog** (4.08 caption **"assembler status"**; older screenshot IMG compile03.gif says "compiler status"):

| Element | 4.08 evidence (BIN frmInfo) | Older screenshot (IMG compile03.gif) | Conf. |
|---|---|---|---|
| Top text box (the current file / "external" area) | `txtCURRENT` | "external" label + box | medium |
| status list | `lstStatus` | "status:" list | high |
| processing / pass indicator | `lblPASS_NUMBER`, progress picture | "processing:" box | medium |
| compilation errors list | `lstErr`, `lstERROR_CAUSE`. Format: `(line) message`, e.g. `(4) wrong parameters: MOV DS, 100` and `(4) cannot use segment register with an immediate value`. Clicking an error highlights the source line (red arrow in screenshot). | "compilation errors:" | high |
| right-click popup on the lists | "copy selected line", "copy all" | — | high (labels) |
| **view...** button | popup: symbol table · listing · ─ · explore... | "browse..." button (older) | high (labels) |
| **external...** button | tooltip "load this file to debug.exe (external)". Popup: debug.exe (**SC F12**, initially disabled) · command prompt · run (initially disabled) | "external..." | high (labels) |
| **close** | close the dialog | "close" | high |
| **run** | load into the emulator (cmdEmulate) | "run" | high |

Status-message strings (BIN, **medium**; exact assembly unverified): "`<file>` is assembled successfully into `<n>` bytes.", "Assembled in `<n>` passes. Time spent: `<t>` seconds.", "#make_com# detected." (etc.), "creating plain binary file.", "Listing is saved:", "Symbol table is saved:", "there are errors!", "executable file is not created!". Error examples: "COM file not built, aborted - ORG 100h not found!", "Cannot generate a COM file. Remove the stack segment.", "duplicate declaration of:", "no ENDP for:", "no ENDS for:", "wrong entry point!", "Condition Jump out of range!", "Wrong parameters:", "Operands do not match: Second operand is over 8 bits!" (D-COMP).

### 2.4 Options dialog (editor)
Groups: "fonts and colors" (control: source code editor / emulator screen / memory list / disassembler list; set font..., background color); "keywords" (item: comments, instructions, line numbers, decimal numbers, operators, procedures/macro, strings, registers, segment reg, directives, text; foreground/background colour; font style normal/bold/italic/bold + italic/underline); "tabs" (convert tabs to spaces while typing, tab size); "line numbers" (style <none>/binary/octal/decimal/hex, start at); other (confine caret to text, auto-indent mode no indentation/indent on PROC/as previous line, keyword case normalization, show line numbers on thumb scroll); buttons "reset all", "close". Evidence: BIN frmOptions. **high** for labels; no documentation of behaviour.

---

## 3. Emulator window menus — EMU8086 4.08

Window title: `emulator: <file>` (IMG emulator02/03: "emulator: emu8086.com"; IMG write_bin_menu: "emulator: noname.com - 8086 microprocessor emulator"). **medium**.
Menu bar, left to right: **file · math · debug · view · external · virtual devices · virtual drive · help** (BIN; matches IMG emulator02/03). **high**.

### 3.1 file
| Item | Purpose | Shortcut | Evidence | Conf. |
|---|---|---|---|---|
| load executable... | Load .com/.exe/.bin/.boot (filter: "all known files (*.asm, *.exe, *.com, *.bin, *.boot)"). Loading a .asm source assembles it. | — | BIN; D-EMU | high |
| reload | Reload the current executable (same as the toolbar button) | **SC F4** | BIN | high |
| ─ | | | | |
| examples ▸ | Hello, world · add / subtract · calculate sum · compare numbers · binary, hex and octal values · traffic lights · palindrome · LED display · stepper motor · simple i/o · more examples... | — | BIN | high |
| ─ | | | | |
| reset emulator and ram | Full reset including memory | — | BIN | high (label), medium (behaviour) |
| ─ | | | | |
| set command line parameters | Dialog: "enter command line parameters, or click cancel to reset." (for the PSP command tail) | — | BIN | medium |
| ─ | | | | |
| save the emulator's state | Saves state ("the emulator's state is saved to:"; INI `SAVE_ASCII_STATE`) | — | BIN; INI | medium |
| load from previous state | Restore a saved state (disabled at design time until a state exists, inferred) | — | BIN | medium |
| ─ | | | | |
| (recent files) | MRU list for the emulator (`RecentEmulator`) | — | BIN | high |
| ─ | | | | |
| close the emulator | | — | BIN | high |

### 3.2 math
multi base calculator · base converter. These open the same windows as the editor's math menu (§1.6). Evidence BIN. **high**.

### 3.3 debug
| Item | Purpose | Shortcut | Evidence | Conf. |
|---|---|---|---|---|
| single step | Execute one instruction at CS:IP | **SC F8** | BIN; D-START; D-EMU | high |
| step over | Run a CALL/INT/macro at full speed and stop after it | **SC Shift+F8** | BIN; D-ISA ("Shift + F8 hot key to Step Over… set step delay to zero") | high |
| ─ | | | | |
| step back | Undo the previous step (also OUT and most file operations; INI `ENABLE_STEP_BACK`, `MAXIMUM_STEPS_BACK`) | **SC F6** | BIN; D-START; VER 4.02 | high |
| ─ | | | | |
| stop on condition... | Opens the stop-on-condition window (§6.7) | — | BIN; D-SOC; VER | high |
| ─ | | | | |
| run until (...) | Run until the selected position (the caption fills in an address) | **SC Ctrl+F8** | BIN | high (label/key), medium (behaviour) |
| run | Run | **SC F9** | BIN | high |
| stop | Stop running | — | BIN | high |
| ─ | | | | |
| set break point (...) | Set the (single) breakpoint at the selected disassembly line | — | BIN | high (label), medium (single breakpoint: "show current break point", singular) |
| clear break point | | — | BIN | high |
| show current break point | Initially disabled | — | BIN | medium |
| ─ | | | | |
| show current instruction (at CS:IP) | Scroll/select the lists at CS:IP | **SC F7** | BIN | high |
| ─ | | | | |
| set CS:IP to selected position (????:????) | Move execution to the selected disassembly line | **SC Ctrl+Shift+F7** | BIN | high (label/key) |

When a breakpoint is hit, the emulator shows the message "break point encountered at:" (BIN string). **medium**.

### 3.4 view
| Item | Opens | Shortcut | Evidence | Conf. |
|---|---|---|---|---|
| log and debug.exe emulation | "debug log - debug.exe emulation" window (§5) | **SC F11** | BIN; VER 4.02 ("hotkey for the emulator's log button is F11"; "log button is renamed to debug") | high |
| ─ | | | | |
| extended value viewer | §6.1 | — | BIN | high |
| ─ | | | | |
| stack | §5 | — | BIN | high |
| ─ | | | | |
| variables | "variables" window §5 | — | BIN; D-TUT03 ("selecting Variables from the View menu") | high |
| memory | "Random Access Memory" tabled memory viewer §6.2 | — | BIN; VER 4.02 ("New tabled memory viewer/editor, click aux") | high |
| ─ | | | | |
| symbol table | "symbol table" viewer | — | BIN; VER | high |
| listing | Listing (.list), shown in Notepad by default (INI `ASCII_VIEWER`) | — | BIN; INI | medium |
| ─ | | | | |
| original source code | §6.5 | — | BIN | high |
| ─ | | | | |
| options | Options (fonts/colours, see §2.4) | — | BIN | medium |
| ─ | | | | |
| arithmetic & logical unit | ALU window (caption stored as `&&` = literal "&") | — | BIN; PHIL p.2 (ALU "shows the internal work of the CPU") | high (label), low (layout) |
| ─ | | | | |
| flags | §5 flags window | — | BIN; D-EMU | high |
| ─ | | | | |
| lexical flag analyzer | "lexical flag analyser". Text interpretation of the flags, e.g. "=== unsigned === not below (CF=0), above (CF=0 and ZF=0) … === signed === not less (SF=OF), greater (SF=OF and ZF=0), not equal (ZF=0), positive (SF=0), no overflow (OF=0), parity odd (PF=0), not aux carry (AF=0), hw-int enabled (IF=1), forward dir (DF=0)" | — | BIN; INI (font keys); VER 4.02 | high (labels) |
| ─ | | | | |
| ascii codes | ASCII table | — | BIN | high |
| ─ | | | | |
| emulator screen | §6.4 | — | BIN | high |

### 3.5 external
| Item | Purpose | Shortcut | Evidence | Conf. |
|---|---|---|---|---|
| start debug.exe (external) | Launch Windows debug.exe on the file | **SC F12** | BIN; VER 4.02 ("External debug.exe can be easily launched by F12") | high |
| ─ | | | | |
| command prompt (external) | Open cmd in the output folder | — | BIN; VER 4.02 | high |
| ─ | | | | |
| run (external) | Run the executable outside the emulator. Warns first (INI `WARN_RUN`; message "note: running buggy/unchecked executable files outside of the emulator may cause a malfunction…") | — | BIN; INI; VER | high |

Out of scope for a browser re-creation. Recommendation: omit these or show them disabled.

### 3.6 virtual devices
Built dynamically from `c:\emu8086\devices\` (the design-time item is a hidden placeholder) plus a separator. In 4.08 the shipped executables are LED_Display, Printer, Robot, Simple, Stepper_motor, Thermometer, Traffic_Lights, VGA_STATE. D-TUT12 lists 7 devices: "traffic lights, stepper-motor, LED display, thermometer, printer, robot and simple test device". .jar/.class files are also added (VER 4.02). The `#start=xxx.exe#` directive launches a device automatically (VER 4.02/4.05). Evidence: BIN; repo DEVICES folder; D-TUT12; D-IO. **high** (mechanism), **medium** (exact list order).

### 3.7 virtual drive
| Item | Sub-items | Purpose | Evidence | Conf. |
|---|---|---|---|---|
| boot from virtual floppy ▸ | FLOPPY_0 … FLOPPY_3 (only existing drives appear; screenshot shows FLOPPY_0 only) | Boot the emulator from the floppy image (loads the boot sector to 0000:7C00) | BIN; IMG white_boot_sector.png ②; D-COMP; D-TUT11 | high |
| ─ | | | | |
| write 512 bytes at 0000:7c00 to boot sector ▸ | FLOPPY_0 … FLOPPY_3 | Writes memory 0000:7C00..7DFF to the boot sector (asks to overwrite) | BIN; IMG white_boot_sector ①; D-COMP | high |
| write '.bin' file to floppy... | | Dialog "write .bin file to virtual floppy drive": path, drive number, cylinder, head, sector, Write/Close; "note: each sector has 512 bytes", "the kernel must be written to sector 2." | BIN; IMG write_bin.gif; D-TUT11 | high |
| ─ | | | | |
| create new floppy drive | Creates FLOPPY_1..3 (max 4: "only 4 floppy drives are allowed!") | BIN; D-EMU "Virtual drives" | high |

Out of scope for a university course. Recommendation: omit or disable.

### 3.8 help
documentation and tutorials (**SC F1**) · ─ · check for an update... · ─ · about... (BIN, **high**).

### 3.9 Hidden "aux" popup (shown by the aux button)
memory · ALU · FPU · stop on condition · ─ · symbol table · listing (BIN `mnuAUX`, Visible=False at the top level, so it is a popup). VER 4.02: "New tabled memory viewer/editor, click 'aux' button", "The symbol table and listing are appended to the aux button", "Stop on condition is added to 'aux' button". **high**.

---

## 4. Emulator toolbar

Left to right (IMG emulator02/03, 4.08 layout; BIN): **Load · reload · step back · single step · run · [step delay slider] "step delay ms: N"**.

| Control | Exact behaviour | Shortcut | Evidence | Conf. |
|---|---|---|---|---|
| **Load** | "load executable file to emulator". Opens a file dialog. Executables with no source can be loaded, but then the "original source" window isn't available. | — | BIN tooltip; D-EMU; IMG emulator02 callout | high |
| **reload** | "reload executable file": reloads the current executable from disk into memory and resets the registers to their load values (the same file again, so you can restart). Different from **reset** (§5). | F4 | BIN tooltip + menu SC; D-TUT07 ("F5 hotkey to recompile and reload"); PHIL p.158 screenshot "Reload" | high (exists), medium (exact register/memory reset scope) |
| **step back** | "revert the changes made by previous step forward". Disabled (grey) when there is no history (IMG emulator02 shows it greyed after load). Covers OUT and most file I/O. "byte-by-byte undo is not allowed" for files. | F6 | BIN; D-START; VER 4.02; INI | high |
| **single step** | "process instruction at CS:IP". Executes exactly one instruction. A macro is stepped instruction by instruction; use step over (Shift+F8) to skip it. | F8 | BIN; D-EMU; D-ISA | high |
| **run** | In 4.08 this is a **toggle** (checkbox-style button, tooltip "make [single steps] automatically"). It keeps single-stepping with the step delay between instructions. Click again or use debug → stop to stop. | F9 (menu) | BIN (`chkAutoStep`); D-EMU ("[Run] button executes instructions one by one with delay set by step delay") | high |
| **step delay slider + label** | Label reads "step delay ms: N" (N in **milliseconds**). Screenshots show 0 ms (4.08) and 200 ms (v3.07). D-ISA: "to make macro code execute at maximum speed set step delay to zero". | — | BIN; IMG emulator02/03; PHIL p.158–159 | high (units ms, 0 allowed), **UNVERIFIED** (min/max and tick increments; slider property-bag bytes not decoded) |

**What Run does when execution ends** (all **medium**: BIN strings plus doc context, not a step-by-step doc statement):
- **Breakpoint**: stops and reports "break point encountered at:" plus the address.
- **HLT**: stops with "the emulator is halted." (BIN). HLT is the documented way to end BIN programs. default.binf plants an F4 (HLT) byte at 0100:FF00 so a final RET halts (BINF; VER 4.02).
- **Program termination (INT 20h, or RET into the PSP's INT 20h)**: stops and shows the message box **"PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM"** (BIN; two lines, "PROGRAM HAS RETURNED CONTROL" / "TO THE OPERATING SYSTEM"). If there was screen output, the screen window is brought forward (INI `ACTIVATE_SCREEN_WHEN_STOPPED=true`).
- **INT 19h**: "program requested reboot. the emulator halted." (BIN; D-INT: "The emulator just stops the execution").
- **Stepping after termination**: BIN has "program terminated. reload:" / "reload?". So stepping again offers to reload (**low**: wording assembly unverified).
- **Waiting for keyboard input** (INT 16h/00h, 21h/01h etc.): a "waiting for input" panel appears with a **stop** button (BIN `picWaitingForInput`). **medium**.
- Unsupported interrupt: "this interrupt is not defined yet, it is availabe for custom functions…" (BIN; D-MEM: the INT 0FFh stub "used to generate a default error message"). **medium**.

---

## 5. Emulator bottom buttons (4.08)

Left to right (IMG emulator02/03; BIN): **screen · source · reset · aux · vars · debug · stack · flags**.
Older variants: PHIL/VTS (3.x) **User Screen · Actual Source · ALU · Stack · FLAGS**. IMG write_bin_menu (4.0x) **screen · source · reset · alu · vars · log · stack · flags**. VER 4.02 confirms "log" → "debug" and the aux additions.

| Button | Tooltip (BIN) | What it shows / does | Evidence | Conf. |
|---|---|---|---|---|
| **screen** | "emulator virtual screen" | Shows the "emulator screen" window (§6.4). Auto-activated on output unless INI `ACTIVATE_SCREEN=false`. | BIN; VER; INI | high |
| **source** | "original source code" | Shows the original source window (§6.5) | BIN; D-COMP (.~asm/.debug) | high |
| **reset** | "reset emulator: restore interrupt vector, close all file handles, clear screen and reload the program" | That, exactly. Note it also *reloads the program*. | BIN | high |
| **aux** | "auxiliary tools" | Opens the popup: memory · ALU · FPU · stop on condition · symbol table · listing (§3.9) | BIN; VER 4.02 | high |
| **vars** | "show defined variables, arrays and strings" | The "variables" window. Toolbar: **size:** combo (byte, word, dword, qword, tword), **elements:** text box, **show as:** combo (hex, bin, octal, signed, unsigned, ascii), **edit** button. One row per symbol (name + value(s)). Double-click or edit opens "edit variable or buffer": type a value in any base (h/b/o suffix), a string like `'hello world', 0`, an array `1, 2, 3`, or an expression `5 + 2`. | BIN frmVars/frmEditVariable; D-TUT03 (Variables section); IMG varview.gif | high |
| **debug** | "log and debug.exe emulation" | Window **"debug log - debug.exe emulation"**: log text area, command combo (enter debug commands), buttons **save to file...**, **clear**, help. Commands (D-DEBUG): `c` compare (`c v1 L 7 v2`; default 8 bytes; only differences printed), `i`/`iw` port input, `o`/`ow` port output, `d` dump 128 bytes (`d ds:[bx]`, `d 100`, `d lion L 10`, repeat `d` = next block; default segment CS), `t` single step, `p` step over, `r` registers + current instruction, `rf` view/set flags, `r <reg>` view/set a register. All I/O is hex, no `h` suffix. | BIN frmDebugLog; D-DEBUG; VER 4.02 | high |
| **stack** | "memory at SS:SP from bottom to top" | Window "stack": a single list (Terminal font) of words around SS:SP. The top of the stack is marked with **"<"**. Exact row format **UNVERIFIED** (likely `SSSS:OOOO  WORD` per row). | BIN; D-TUT09 ("The top of the stack is marked with '<' sign") | high (marker, purpose), low (row format) |
| **flags** | "show flags register" | Window "flags": **8 checkboxes, editable at runtime**: CF "Carry Flag", ZF "Zero Flag (0-not zero, 1-zero)", SF "Sign Flag (0-positive, 1-negative)", OF "Overflow Flag", PF "Parity Flag (0-odd, 1-even)", AF "Auxiliary Flag", IF "Interupt enable Flag", DF "Direction Flag (0-forward, 1-backward)", plus an **analyse** button (opens the lexical flag analyzer). TF is not shown. | BIN frmFLAGS; D-EMU ("[Flags] button allows you to view and modify flags on runtime") | high |

---

## 6. Other emulator windows and lists

### 6.1 Extended value viewer
- Opened by **double-clicking a register text box** ("value of that register converted to all possible forms. You can modify the value of the register directly in this window"), by **double-clicking a memory-list item** (loads the WORD there: low byte from the selected address, high byte from the next), or by view → extended value viewer. (D-EMU, **high**.)
- 4.08 controls (BIN frmExtendedViewer; matches VTS p.3–4 Figs 12, 16): **watch:** combo of register names plus **MEM:** (when MEM, Segment:Offset boxes appear); **word / byte** radio; columns **H / L** ("High Byte"/"Low Byte"); rows **hex:**, **bin:**, **oct:** per byte; group **decimal 8 bit** (unsigned:, signed:, ascii: per byte); group **decimal 16 bit** (unsigned:, signed:). Edit any field and the others update; closing applies the change (VTS p.4 Fig 13–14: "the value of AX is changed (blue color)"). **high** (fields), **medium** (exact commit semantics).
- Registers can also be edited **by typing over the value in the register boxes** (D-EMU). **high**.

### 6.2 Memory list (integrated, middle column)
- Above the list: an address box `SSSS:OOOO` (BIN `txtIntegratedMemoryAddr`). 4.08 accepts **any effective address or variable name**: `CS:[BX+2]`, `DS:var2`, `DS:[SI]`. The same applies to the disassembly address and the tabled viewer (VER 4.02). **high**.
- Row format (IMG emulator03 legend, **high**): `PPPPP: HH DDD C`, i.e. **physical address** (5 hex digits, e.g. `07100:`), **hex byte**, **decimal byte** (3 digits), **ASCII char** (control codes shown as names such as `NULL`, `TAB`, or glyphs). VER 4.02: "The emulator shows physical memory addresses in the memory list". Older builds show `offset:` (e.g. `0100:`) under a "memory (1K) at:" button (tut3a; PHIL p.159; VTS "block of memory (1K) at a time").
- Bytes of the current instruction are highlighted. The first byte is the selection colour (blue) and the others are yellow, mirrored in the disassembly (IMG emulator03). **medium**.
- Double-click opens the Extended Value Viewer (word) (§6.1). **high**.
- **Tabled memory viewer** (view → memory or aux → memory): window "Random Access Memory", **list / table** radio, address box, **update** button ("update memory viewer"), in-place edit box. **high** (labels).

### 6.3 Disassembly list (right column)
- Address box above it (`txtDisAddr`, e.g. `0700:0100`), editable like the memory address (VER 4.02). **high**.
- One line per decoded instruction, e.g. `MOV AX, 00003h`, `INT 010h`, `JMP 011Eh`. Immediates are shown with a leading 0 and `h` suffix (IMG emulator03). **high**.
- The current CS:IP line is selected or highlighted. A line can be selected and used with debug → set break point / run until / set CS:IP to selected. **medium**.
- BIOS calls disassemble as **`BIOS DI`** (the FFFF CD xx form) (D-MEM). Data after RET is disassembled as instructions (D-TUT03). **high**.

### 6.4 "emulator screen" window
- Title: **"emulator screen. (dimension: 36 x 11)"** in the screenshot. The dimension follows the current text mode and window size (IMG screen01.gif; D-MEM: "The emulator screen can be resized"). Default mode is 80x25 CGA (D-MEM system area). Note D-MEM's own system-area defaults (50 columns, 20 rows) disagree with the 80x25 statement. **medium**.
- Buttons: **clear screen**, **change font**. Changing the font warns "note: video memory must be re-written after changing font or display size." (BIN). **high**.
- **"[0 / 16]" indicator** = keyboard buffer fill (characters waiting / capacity 16). It shows the buffered ASCII, and clicking it offers "flush keyboard buffer?" / "clear keyboard buffer". (VER 4.02: "The keyboard buffer is now visible and can be flushed with a click"; BIN `lblKeyboardBuffer`, `lblKeyboardBufferASCII`.) **medium**: the meaning of "16" as capacity is inferred.
- Other states: "hardware interrupts are disabled" label; a hotkey notice "SCREEN_HOTKEYS=false". With the default `SCREEN_HOTKEYS=true`, F8/F6 etc. work while the screen has focus and are not sent to the keyboard buffer. Esc is not a hotkey (VER 4.02; INI). **high**.
- Bell (ASCII 7) beeps; Tab (9) is expanded (VER 4.02). The emulator does not blink (BIN). **high**.

### 6.5 "original source code" window
- Title "original source code" (4.08, BIN frmOrigCode). VTS Fig 11 shows the older title "Actual Emulated Source Code". Read-only code view with line numbers and syntax colours. **The highlighted line is the next instruction to be executed** (VTS p.3: "the highlighted instruction is the next one to be executed"). Uses `.~asm` + `.debug` (D-COMP). Right-click popup: copy, copy all, find..., find next (BIN). Lines are trimmed unless `TRIM_ORIGINAL_SOURCE=false` (INI). **high**.
- Not available when an executable is loaded without its source files (D-EMU). **medium**.

### 6.6 Registers panel
- Group "registers": AX/BX/CX/DX each shown as **H** and **L** byte boxes; CS, IP, SS, SP, BP, SI, DI, DS, ES as 4-hex-digit boxes. Tooltips: Accumulator, Base address, Counter, Data register, Code Segment, Instruction Pointer, Stack Segment, Stack Pointer, Base Pointer, Source Index, Destination Index, Data Segment, Extended Segment (BIN; IMG emulator03). **high**.
- Changed values are shown in a different (blue) colour (VTS p.4 Fig 14). **medium**.
- Values are hex by default. Double-click shows all bases (D-TUT07). **high**.

### 6.7 Stop on condition
Window "stop on condition": **operand** combo (registers, "byte at:", "word at:" with a seg:off box, Carry/Zero/Sign/Overflow/Parity/Auxiliary/Interrupt/Direction flags), **condition** combo, **expression** box, note "hex values must start with 0 and have h suffix.", and a label "the condition is true". It works only while its window is open. Operators: `~ * / % + - << >> & ^ |`. Offset and segment for memory are always hex. (D-SOC; BIN; VER.) **high** (fields). The condition combo's entries are **UNVERIFIED** (VER says "changes or becomes equal to").

---

## 7. Emulator behaviour details

### 7.1 .COM load address and initial registers (EMU8086 4.08)
| Register | Value at load | Evidence | Conf. |
|---|---|---|---|
| CS | **0700** | IMG emulator02/03 (4.08 layout) | medium-high (screenshot only, no text statement) |
| IP | **0100** | same; D-COMP "loaded with 100h prefix"; D-COMPAT "entry point… always 0100h" | high |
| DS, ES | **0700** (= CS) | IMG emulator03; D-TUT03 "when COM file is loaded the value of DS register is set to the same value as CS" | high |
| SS | **0700** (= CS) | IMG emulator03; D-TUT09 "For COM files stack segment is generally the code segment" | high |
| SP | **FFFE** | IMG emulator03; D-TUT09 "stack pointer is set to value of 0FFFEh. At SS:0FFFEh stored a return address for RET" | high |
| AX, BX, DX, BP, SI, DI | 0000 | IMG emulator03 | medium |
| CX | **= program size in bytes** (screenshot CX=004B for that program; VTS Fig 10 CX=0005 for a 5-byte program) | IMG emulator03; VTS p.3 Fig 10 | medium (inferred from two screenshots) |
| Word at SS:FFFE | **0000** (so the final `RET` jumps to CS:0000) | D-TUT09 ("generally it's 0000h") | high |
| Flags | UNVERIFIED (IF=1 by default: INI `HARDWARE_INTERRUPTS=true` is the "Initial state of Interrupt Flag") | INI | medium (IF) |
| Physical address of first code byte | 07100h | IMG emulator03 memory list `07100:` | medium-high |

**Discrepancy:** older builds (D-TUT03 text and tut3a.gif, PHIL p.159, VTS Fig 10) load COM at **0B56:0100**. The 4.08-layout screenshots use **0700:0100**. Use **0700** for 4.08.

**PSP:** CS:0000–00FF is the PSP. The documents don't spell out its contents. The 4.0x screenshot IMG write_bin_menu.png shows, after a COM program ended, **CS:IP = F400:0150 (the INT 20h handler), SS=0700, SP=FFFA**. That is consistent with RET → IP=0000 → a `CD 20` (INT 20h) at CS:0000 → INT pushes 3 words (0000 − 6 = FFFA). Conclusion: PSP offset 0 contains `INT 20h`. **medium** (inference).

### 7.2 .EXE load
The entry point comes from `END start` and the header. A stack segment is required. The template sets DS/ES itself (`mov ax, data / mov ds, ax`). The load segment is **UNVERIFIED** in the docs. EXE files are loaded "at offset of 0000" (D-TUT03). **medium**.

### 7.3 .BIN / .BOOT load
- **Default without a .binf** (`c:\emu8086\default.binf`, BINF; D-COMP): load segment **0100**, offset **0000**; **CS=DS=ES=SS=0100, IP=0000, SP=FFFE**; AL..DH, SI, DI, BP = 0. Plus `MEM=0100:FFFE,00FF-0100:FF00,F4`: word **FF00** at the top of the stack and **F4 (HLT) at 0100:FF00**, so a plain `RET` ends in HLT ("default.binf is updated to automatically stop the program when RET instruction is executed", VER 4.02). **high**.
- D-COMP describes this differently: "in case the emulator is not able to find MY.BINF file, current register values are used and MY.BIN file is loaded at current CS:IP", and later "when emulator loads .bin file without .binf file it will use c:\emu8086\default.binf instead". The second sentence and VER 4.02 are the newer behaviour. **high** (default.binf).
- **.binf file format** (D-COMP; BINF): 17 lines, one hex value each (comments ignored, line order significant): load segment, load offset, AL, AH, BL, BH, CL, CH, DL, DH, DS, ES, SI, DI, BP, CS, IP, SS, SP, then optional `MEM=` entries. Directives that create it: `#make_bin#`, `#LOAD_SEGMENT=hhhh#`, `#LOAD_OFFSET=hhhh#`, `#AL=…#`…`#SP=…#`, `#MEM=…#`. All values hex. If LOAD_SEGMENT/OFFSET are missing, CS:IP is used and vice versa. When the load offset isn't 0, add `ORG` with that offset. **high**.
- **#make_boot#**: loads at **0000:7C00** (CS=0000, IP=7C00), max 512 bytes, `ORG 7C00h` required, output is .bin plus .binf (".boot output type is obsolete", VER 4.02; D-COMP; D-TUT11; TPL). **high**.
- Load-area guard: "can not load in this memory area! free memory area is between 0050:0000h and 0a000:0000h — file will be loaded at 0100:0000h" (BIN). **medium**.

### 7.4 Termination, HLT, and termination interrupts
| Event | Behaviour | Evidence | Conf. |
|---|---|---|---|
| `RET` at the end of a COM program | Pops 0000 → executes INT 20h in the PSP → message | D-TUT09; IMG write_bin_menu (F400:0150); ROM | medium-high |
| `INT 20h` | "exit to operating system". Handler at **F400:0150** = bytes `FF FF CD 20 CF` (BIOS DI 20h; IRET). The emulator stops and shows **"PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM"**. | D-INT; D-MEM IVT; ROM bytes; BIN string | high (handler, message text), medium (message is shown for INT 20h) |
| `INT 21h / AH=4Ch` | "return control to the operating system (stop program)". Same stop. The EXE template uses `mov ax, 4c00h / int 21h`. The return code (AL) handling is UNVERIFIED. | D-INT; TPL | high (stops), low (exact message is the same one) |
| `HLT` | The emulator stops: "the emulator is halted." The BIN template ends with `HLT ; halt!`. | BIN; TPL | medium |
| `INT 19h` | Stops: "program requested reboot. the emulator halted." (unless the IVT is overridden) | D-INT; BIN | high |
| After stop | The screen window comes to the front if there was output (INI `ACTIVATE_SCREEN_WHEN_STOPPED`) | INI; VER | high |

### 7.5 Memory map and startup memory contents (D-MEM, high)
| Physical range | Contents |
|---|---|
| 00000–003FF | Interrupt vector table, loaded from `c:\emu8086\INT_VECT` (file size 1,045 bytes = 415h, so its last 21 bytes land in 00400–00414) |
| 00400–004FF | System information area. Defaults: 0040:0010 equipment word (bits 5-4 = 10 → 80x25 CGA; bits 7-6 = floppy count−1); 0040:0013 = **0280h** (640 KB; also returned by INT 12h); 0040:004A columns (doc: 0032h = 50); 0040:004E page start 0000; 0040:0050 cursor positions 8 words = 0; 0040:0062 page 0; 0040:0084 rows−1 (doc: 13h = 19, "19+1=20") |
| 00500–9FFFF | Free (654,080 bytes) for programs |
| A0000–B0FFF | VGA video memory (mode 13h) |
| B1000–B7FFF | Reserved / unused |
| B8000–BFFFF | CGA text memory, **8 pages × 1000h bytes** |
| C0000–F3FFF | Reserved |
| F4000–10FFEF | ROM BIOS: `c:\emu8086\BIOS_ROM` loaded at physical **0F4000h** (segment **F400**) |

Startup contents of free RAM are **UNVERIFIED** in the docs. The 3.x screenshot (PHIL p.158) shows zeros at 0050:0000 with CS=0050, IP=0000 before anything is loaded. So assume zero-filled.

**IVT entries (D-MEM, verified against the INT_VECT/BIOS_ROM bytes, high):**

| INT | Handler | Purpose |
|---|---|---|
| 00 | F400:0170 | divide error (CPU) |
| 04 | F400:0180 | INTO overflow (CPU) |
| 10 | F400:0190 | video |
| 11 | F400:01D0 | equipment list |
| 12 | F400:01A0 | memory size |
| 13 | F400:01B0 | disk |
| 15 | F400:01E0 | BIOS functions |
| 16 | F400:01C0 | keyboard |
| 17 | F400:0400 | printer |
| 19 | FFFF:0000 | reboot |
| 1A | F400:0160 | time |
| 1E | F400:AFC7 | diskette parameter table |
| 20 | F400:0150 | DOS terminate |
| 21 | F400:0200 | DOS functions |
| 33 | F400:0300 | mouse |
| all others | F400:0100 | default stub `FF FF CD FF` (= INT 0FFh → "not defined" error message) |

Each handler is the 4-byte pseudo-instruction **`FF FF CD nn`** (disassembled as `BIOS DI`), which makes the emulator perform interrupt nn natively, followed by `CF` (IRET) (D-MEM; ROM). **high**. Overriding a vector in the IVT replaces the built-in function. The custom memory map lives in `custom_memory_map.inf` (D-CMM).

### 7.6 Supported interrupt functions (D-INT "Quick reference", high)
- **INT 10h**: 00h set video mode (modes 00h 40x25, 03h 80x25 text with 16 colours and 8 pages; 13h 320x200 256 colours); 01h cursor shape; 02h set cursor pos; 03h get cursor pos/size; 05h select page; 06h scroll up; 07h scroll down; 08h read char+attr; 09h write char+attr; 0Ah write char; 0Ch put pixel; 0Dh get pixel; 0Eh teletype; 13h write string; **AX=1003h** toggle intensity/blink (blink not supported).
- **INT 11h** equipment list; **INT 12h** memory size; **INT 13h**: 00h reset, 02h read sectors, 03h write sectors; **INT 15h/86h** wait (CX:DX µs); **INT 16h**: 00h get key (wait, removes), 01h check key (ZF=1 if none); **INT 19h** reboot (emulator stops); **INT 1Ah/00h** ticks since midnight (AL not set); **INT 20h** exit.
- **INT 21h**: 01h, 02h, 05h, 06h, 07h, 09h ('$'-terminated; BIN warns "byte 24h not found after 2000 bytes"), 0Ah (buffered input: byte 0 = size, byte 1 = count, no '$' added), 0Bh, 0Ch, 0Eh, 19h, 25h, 2Ah, 2Ch, 35h, 39h, 3Ah, 3Bh, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 47h, **4Ch**, 56h. Added per VER 4.02 but not in the quick-reference list: 43h (attributes), 48h, 4Eh/4Fh, 57h AL=0/1. 
- **INT 33h** (mouse): 0000h, 0001h, 0002h, 0003h.
- DOS file system is emulated in `C:\emu8086\vdrive\x\`, defaulting to MyBuild. 8.3 names (D-INT).
- **Discrepancy:** D-INT lists **INT 21h/08h nowhere** in the quick reference, but 0Ch accepts 08h as a sub-function. Treat 21h/08h as UNVERIFIED.

---

## 8. Assembler syntax as documented

### 8.1 Numeric literals
| Form | Example | Rule | Evidence | Conf. |
|---|---|---|---|---|
| Decimal | `20`, `20d` | No suffix, or the `d` suffix | D-NUM; D-TUT03; VER 4.02 (.RADIX notes: suffixes "h", "o", "b", "d") | high |
| Hexadecimal | `0ABCDh`, `15Eh` | `h` suffix. **Must start with a digit** (prefix 0 when the first digit is A–F). | D-NUM; D-TUT02 | high |
| Hex, C-style | `0x8F0B` | `0x` prefix accepted | VER 4.02 (.RADIX section: "DW 0x8F0B ; correct", "must ALWAYS have an h suffix or 0x prefix") | high |
| Binary | `00011011b`, `1101_1111b` | `b` suffix. **`_` may separate digits** ("separate nibbles of long binary values") | D-NUM; D-TUT02 (`MOV CH, 1101_1111b`); VER 4.02 | high (binary); UNVERIFIED (`_` in hex/decimal; IO/TUT12 uses it only in binary) |
| Octal | `77o` | `o` suffix | D-NUM; D-TUT03 (vars window "octal 'o' suffix") | high |
| Octal `q` suffix | `77q` | Not documented | — | UNVERIFIED (assume unsupported) |
| `.RADIX n` | `.radix 16` | Changes the default base. Suffixes still win, so `123D` and `101B` stay decimal/binary. | VER 4.02 | high |
| Negative | `-24`, `-1` | Unary minus | D-TUT02/06 | high |
| Expressions | `msg1end - offset msg1`, `5 + 2`, `b-a` | Operators `~ * / % + - << >> & ^ |` (calculator/stop-condition list). Assembler arithmetic like `b-a` works without OFFSET (VER 4.02). | D-NUM; D-INT example; VER | medium (full assembler operator set is not documented) |
| `$` | `sit_end = $`, `jmp $3+2`, `jne $-5` | Location counter. `jmp $N` = relative jump (MASM-compatible since 4.02). | D-TUT07; D-TUT12; VER 4.02 | high |
| `?` | `x db ?` | Uninitialized | D-TUT03 | high |

### 8.2 Character and string literals
`'A'` (`MOV CL, 'A'` = 41h), `"hello world $"`, `'Hello', 0`. Single and double quotes both work. A string in DB becomes a sequence of bytes. "DW cannot be used to declare strings." Missing commas are reported, e.g. `0Ah '$'` (VER 4.02). (D-TUT02, D-TUT03, D-INT examples.) **high**.

### 8.3 Directives and operators
| Item | Documented behaviour | Evidence | Conf. |
|---|---|---|---|
| `ORG 100h` | Required for COM. Sets the location counter. `org 100h` also auto-selects COM. | D-COMP; D-TUT03 | high |
| `ORG 7C00h` | Boot records | D-COMP; D-TUT11 | high |
| `DB`, `DW` | Define byte/word. Names start with a letter; unnamed variables are allowed. | D-TUT03 | high |
| `DD` | Double word (low word first) | VER 4.02 | high |
| `DQ`, `DT` | The vars window offers qword/tword and VER 4.06 fixed the "Var window (DD & DQ)". Assembler support for DQ/DT is **UNVERIFIED**. | VER 4.06; BIN | low |
| `n DUP(v[,v…])` | `c DB 5 DUP(9)`, `d DB 5 DUP(1, 2)` | D-TUT03 | high |
| `EQU` | `k EQU 5`. Also text EQU: `new_line EQU 13, 10`. | D-TUT03; D-TUT11 | high |
| `=` | `sit_end = $` | D-TUT12 | medium |
| `name PROC` … `RET` … `name ENDP` | The name must match ("used to check correct closing") | D-TUT08 | high |
| `FAR`/`NEAR` procs, `CALL FAR`, `JMP FAR addr` with `addr dd 1235:5124h` | supported | VER 4.02; BIN | medium |
| `MACRO` / `ENDM` / `LOCAL` | Params `name MACRO p1, p2`. Must be defined before use. LOCAL avoids duplicate labels. | D-TUT10 | high |
| `INCLUDE 'file'` / `include emu8086.inc` | Searches the source folder, then `Inc` | D-TUT05 | high |
| `NAME "x"` | Accepted (`name "traffic"`) | D-TUT12; D-COMPAT; BIN | high |
| `SEGMENT` / `ENDS`, `END label` | EXE segments. `END start` sets the entry. For COM, END entry ≠ 100h is an error. Code after END is ignored. | D-COMPAT; TPL; BIN ("any code after 'END' directive is ignored.") | high |
| `ASSUME` | **Ignored** | D-COMPAT | high |
| `SEG var` | Replaced with `cs` when there are no segments | VER 4.02 | high |
| `.MODEL`, `.DATA`, `.CODE`, `.STACK`, `.STARTUP`, `.EXIT`, `.8086`/`.186`, `@data` | Recognized by the 4.08 preprocessor (strings: "tiny model has no stack! ignoring line", ".exit → mov ax, 4c00h / int 21h", "ORG 100h must be before .DATA"). **Not described in the help.** | BIN only | medium (accepted), low (exact semantics) |
| `LABEL` (`TEST1 LABEL BYTE`) | "may not be supported by all assemblers" (the doc suggests alternatives). BIN contains `LABEL`. | D-COMPAT; BIN | low |
| `COMMENT *…*` | Multi-line comment | VER 4.02 | high |
| `PAGE`, `TITLE` | Present in BIN (probably ignored) | BIN | low |
| `OFFSET var` | Offset. `MOV BX, OFFSET VAR1` ≡ `LEA BX, VAR1` (same machine code) | D-TUT03 | high |
| `LEA` | Also for indexed variables | D-TUT03 | high |
| `BYTE PTR` / `WORD PTR` | Size override | D-TUT02/03 | high |
| **`b.` / `w.`** | Short forms: `mov w.[bx], 1234h`, `cmp b.[si], 0` | D-COMPAT; D-TUT02/03/08 | high |
| Segment override | `es:[bx]` (manual attachment is required when data is not in DS) | D-COMPAT | high |
| `var[3]`, `a[SI]`, `[BX+SI]+25` | Displacement inside or outside the brackets | D-TUT02/03 | high |
| `#make_com#`, `#make_exe#`, `#make_bin#`, `#make_boot#` | Output type. Setting it twice is an error ("output type is set here again!"). | D-COMP; BIN | high |
| `#LOAD_SEGMENT=…#`, `#LOAD_OFFSET=…#`, `#CS=…#` … `#SP=…#`, `#AL=…#` etc., `#MEM=…#` | Write the .binf (hex values) | D-COMP; TPL | high |
| `#start=device.exe#` | Launch a virtual device | VER 4.02/4.05; D-TUT12 | high |
| `#fasm#`, `#masm#` | Use FASM / external MASM | VER 4.02/4.04 | high |
| `#load_segment#` (bare) | Not a valid form; the documented form is `#LOAD_SEGMENT=hhhh#` | D-COMP | high |

### 8.4 Automatic conversion of out-of-range conditional jumps
"the latest version of the integrated 8086 assembler automatically creates a workaround by replacing the conditional jump with the opposite, and adding big unconditional jump" (D-TUT07). VER 4.02: "short conditional jumps are replaced with the opposite instruction and one normal jump". D-TUT07 adds that this makes "total of 5 bytes instead of just 2, it can be seen in disassembler as well", which also applies to LOOP-family instructions ("loops… have an opposite companion"). **high** for Jcc. **medium** for LOOP/JCXZ (the doc wording is loose). Also: `ROL AL, 5` is assembled as five `ROL AL, 1` (8086 compatibility) (D-COMP). **high**.

### 8.5 Case sensitivity, labels, comments
- "Compiler is not case sensitive, so 'VAR1' and 'var1' refer to the same variable" (D-TUT03). **high**.
- Labels: `name:`. They "cannot start with a number" and can be on their own line or before an instruction (`x2: MOV AX, 2`). Duplicate names give "Duplicate declaration". Variable names "should start with a letter". (D-TUT07, D-TUT03, D-TUT10.) **high**.
- Comments: `;` to end of line, plus `COMMENT` blocks (VER). **high**.
- Strict operand-size checking: INI `STRICT_SYNTAX=true` in the shipped 4.08 ini. VER 4.02 says the default is false and VER 4.03 says it defaults to on. The shipped ini wins: **true**. **medium**.
- `PUSH immediate` is accepted, though the doc notes it is 80186+ (D-TUT09). `PUSHA`/`POPA` appear in the 4.08 mnemonic table (BIN). **medium**.

---

## 9. Discrepancies and version notes (summary)

| Topic | Older source says | 4.08 evidence says | Use |
|---|---|---|---|
| COM load segment | 0B56 (D-TUT03, PHIL, VTS) | 0700 (IMG emulator02/03) | 0700 |
| Emulator bottom buttons | User Screen / Actual Source / ALU / Stack / FLAGS (PHIL, VTS); screen/source/reset/alu/vars/log/stack/flags (IMG write_bin_menu) | screen / source / reset / aux / vars / debug / stack / flags | 4.08 set |
| Step back | absent (3.x) | present (F6) | present |
| Memory list address column | offset under "memory (1K) at:" | physical address, address box accepts EA/variable | 4.08 |
| Compile dialog title / button | "compiler status", "browse..." | "assembler status", "view..." | 4.08 |
| New-file dialog | "Choose Template for New File", 4 options | "choose code template", COM/EXE/BIN/BOOT/empty workspace (+ FASM checkbox) | 4.08 |
| File → examples | "Samples" (PHIL) | "examples" | examples |
| .BIN without .binf | "current register values / loaded at current CS:IP" (D-COMP, early paragraph) | default.binf: 0100:0000, SP=FFFE, HLT trap (D-COMP later paragraph, VER, BINF) | default.binf |
| STRICT_SYNTAX default | false (VER 4.02 text) / on (VER 4.03) | `true` in shipped ini | true |
| INT 21h list | quick-reference list (no 43h/48h/4Eh/4Fh/57h) | VER 4.02 adds them | list both, flag the additions |
| System info defaults | 50 columns / 20 rows (D-MEM table) | default video 80x25 (D-MEM bits 5-4) | 80x25 (doc table probably stale) |

## 10. Items left UNVERIFIED (do not invent)
- Step-delay slider range and step size (only "ms" and the values 0 and 200 seen).
- Exact stack-window row format; exact ALU/FPU window layouts; ascii-codes window layout.
- Whether INT 21h/4Ch shows the identical "PROGRAM HAS RETURNED CONTROL…" box; what happens to AL (exit code).
- Initial FLAGS value at COM load (beyond IF=1 from the ini); free-RAM contents at startup (assumed zeros).
- EXE load segment.
- Support for `q` octal suffix, `_` in hex/decimal, DQ/DT definitions, full `.MODEL` semantics.
- Whether the "the emulator" option in the new-file dialog is visible.
- Keyboard shortcuts for file open/save/new in the editor (none are menu accelerators in 4.08; the CodeMax control may supply some).
- The uoninevah.edu.iq manual (URL returns 404).

## 11. Method notes (reproducible)
- Downloads: HTML in `/tmp/claude-1000/emu-research/html`, PDFs in `/tmp/claude-1000/emu-research/pdf` (text via `pdftotext -layout`, images via `pdfimages`), repo files in `/tmp/claude-1000/emu-research/repo`, the executable in `/tmp/claude-1000/emu-research/bin` (never executed).
- Menu captions and shortcuts come from the VB6 form records in `emu8086.exe`. The shortcut byte after property `0x08` indexes VB6's list: 1–26 = Ctrl+A..Z, 27–38 = F1..F12, 39–50 = Ctrl+F1..F12, 51–62 = Shift+F1..F12, 63–74 = Shift+Ctrl+F1..F12. Validated against the documented F5 (compile and load), F8, Shift+F8, F6, Ctrl+Q, Ctrl+W, F1.
- Nesting comes from VB6 record terminators (`ff 02` sibling, `ff 03 …` end of submenu, `07` has children).
