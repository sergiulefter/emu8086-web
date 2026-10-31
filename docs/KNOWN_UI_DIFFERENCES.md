# Known differences from EMU8086 and limitations

> Part of **emu8086-web**, the free online 8086 assembler, emulator and debugger: [open the live emulator](https://emu8086.sergiulefter.com/) · [README and FAQ](../README.md) · [architecture](ARCHITECTURE.md) · [support matrix](SUPPORT_MATRIX.md) · [known differences](KNOWN_UI_DIFFERENCES.md) · [verification report](VERIFICATION_REPORT.md)

emu8086-web reproduces the EMU8086 4.08 classroom workflow. It is not a byte-for-byte clone. This file lists
every known difference. "Not supported" always means the control is greyed out, or the action stops with an
explicit message. Nothing is faked.

## Deliberate differences
- **Host**: the application runs in a browser tab. The task bar at the bottom is an addition: in-page windows need
  somewhere to restore minimised windows from, and it also offers cascade, tile and reset layout.
- **Editor close button** minimises the editor instead of quitting, because the editor is the main window.
- **Comment/uncomment block** use Ctrl+Alt+Q / Ctrl+Alt+W. Browsers reserve Ctrl+W (close tab) and, on Linux,
  Ctrl+Q (quit).
- **F11**: some browsers use it for full screen before the page sees it. In that case use view → log and
  debug.exe emulation.
- **reload** assembles the current editor source again and restarts it. EMU8086 reloads the executable file from disk, which after a recompile amounts to the same thing.
  If the new source has errors, the old program is not run.
- **Break points**: several break points can be set. EMU8086 4.08 keeps a single one.
- **Emulator status line** (ready / running / waiting for keyboard input) at the bottom of the emulator window is
  an addition. It replaces EMU8086's separate "waiting for input" panel.
- **Keyboard buffer indicator** shows `n/15`, the real BIOS ring-buffer capacity. EMU8086 shows `n/16`.
- **Examples**: the example set is original (hello, add/subtract, sum, compare, bases, palindrome, simple i/o, video
  memory). EMU8086's own examples are proprietary and are not bundled. The traffic lights, LED and stepper motor
  examples are omitted because they need virtual devices.
- **Icons and artwork** are original drawings in the same spirit. EMU8086 icons are not copied.
- **Options dialog** offers step delay, instruction limit per run, auto-show screen, screen font and window layout.
  It does not offer EMU8086's editor colour and font customisation.
- **Fonts**: IBM VGA 8×14 stands in for the Windows "Terminal" font, and IBM VGA 9×16 is used for the screen
  (int10h.org, CC BY-SA 4.0). UI text uses Segoe UI or Tahoma when installed, otherwise a sans-serif fallback
  such as DejaVu Sans on Linux.

## Not supported yet (greyed out, or an explicit message)
- EXE programs (`.MODEL`, `.DATA`, `.CODE`, `SEGMENT/ENDS`, `@data`), `MACRO/ENDM/LOCAL`, `INCLUDE` (including
  `emu8086.inc`, which is proprietary and not bundled), `#fasm#`, `DQ`/`DT`, the `LABEL` directive, FPU
  instructions.
- Graphics video modes (INT 10h AH=00h with AL=13h), pixel services, mouse (INT 33h), disk and file services
  (INT 13h, INT 21h 39h–57h), printer (INT 17h, INT 21h/05h).
- Virtual devices, virtual floppy drives, external debug.exe or command prompt, stop on condition, ALU and FPU
  windows, saving/loading emulator state, command-line parameters, recent-file lists, check for update.
- Hardware interrupts (timer, keyboard IRQ). Programs read the keyboard through INT 16h or INT 21h, whose
  buffer is filled from the emulator screen.

## Behaviour notes
- `CX` holds the program size when a COM program starts. This follows 4.08 screenshots; there is no explicit
  documentation for it.
- At startup, video memory holds spaces with attribute `07h` (BIOS mode-set behaviour). Untouched cells read
  `20 07`.
- Attribute bit 7 means a bright background. Blinking is not emulated, as in EMU8086.
- Step Back does not undo external events: keys typed, *clear screen*, or edits made in the register, memory,
  flags and variables windows. History holds 50 000 steps.
- Each Run is limited to 5 000 000 instructions by default (configurable in options, or unlimited). EMU8086 has no
  such limit; the limit keeps runaway loops from running indefinitely.
- Window positions are not pixel-identical to EMU8086. Default sizes are chosen for 1366×768 and 1440×900.
