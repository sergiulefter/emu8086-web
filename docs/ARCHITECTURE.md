# Architecture

> Part of **emu8086-web**, the free online 8086 assembler, emulator and debugger: [open the live emulator](https://emu8086.sergiulefter.com/) · [README and FAQ](../README.md) · [architecture](ARCHITECTURE.md) · [support matrix](SUPPORT_MATRIX.md) · [known differences](KNOWN_UI_DIFFERENCES.md) · [verification report](VERIFICATION_REPORT.md)

emu8086-web is a single-page application (React 19 + TypeScript, built with Vite). All assembly, emulation and
rendering run in the browser tab; there is no backend.

```
 editor text ──► assembler ──► AssembleResult {bytes, origin, sourceMap, symbols, diagnostics}
                                     │
                                     ▼
                     Machine.load ─► DosEnvironment.initMachine (IVT, BDA, ROM stubs, video mode 3)
                                     │      loadCom (PSP, stack, CS=DS=ES=SS=0700) / loadBin
                                     ▼
 UI ◄── EmulatorSession ◄── Machine.step()  ──► CPU.step() ──► Memory (1 MiB, write journal)
  │        (run scheduler,        │                  │
  │         step over,            │                  └─ FF FF CD nn trap in ROM ─► DosEnvironment.service
  │         run until)            └─ history (registers + memory journal + service state) ─► stepBack()
  └── screen canvas reads RAM at B8000h directly (TextScreen / CP437 / CGA palette)
```

## Modules

| Module | Responsibility | Key contracts |
|---|---|---|
| `src/assembler` | Lexer (native EMU8086 numeric notation), expression and operand parser, multi-pass encoder with jump relaxation | `assemble(source) → {ok, bytes, origin, entry, outputType, sourceMap[], symbols[], diagnostics[], notes[], binf}` |
| `src/cpu` | 8086 interpreter (`step()` = exactly one instruction including prefixes and REP iterations), memory, disassembler | `cpu.step()`, `CpuFault`, `memory.journal` |
| `src/dos` | Emulated PC/DOS environment: IVT pointing to ROM stubs at F400:xxxx, BIOS data area, PSP, loaders and INT 10h/16h/21h… services | `loadCom`, `loadBin`, `service(vector)` → `pending {stop | waiting | sleepMs}` |
| `src/devices/vga` | Colour text mode over RAM (`B8000h`, 2 bytes/cell), CP437, palette, BIOS teletype/scroll primitives | `TextScreen.getCell(row, col)` reads RAM; never a separate buffer |
| `src/debug` | `Machine` (atomic step with history, stop reasons, source mapping), `EmulatorSession` (time-sliced Run, step over, run until, limits), calculator, debug.exe commands | `machine.step() → {executed, stop, waiting}`, `machine.stepBack()`, `session.toggleRun()` |
| `src/ui` | Window manager (z-order, drag, resize, min/max/close, persisted layout), menus, toolbars, CodeMirror editor, emulator windows | `store` (useSyncExternalStore) |

## Execution and stop semantics

- `HLT` → stop reason `halt` ("the emulator is halted.").
- `INT 20h`, `INT 21h/00h`, `INT 21h/4Ch` → `exit` (with AL as the exit code for 4Ch).
- `INT 19h` → `reboot`; divide error / INTO / INT 3 without a handler → `interrupt-error`.
- Undefined opcode forms → `fault`; services that are not implemented → `unsupported`.
- Break point, run-until target, instruction limit and user Stop are reported by the session, not the machine.

A top-level `RET` in a COM program is executed as a real near `RET`: it pops `0000` from `0700:FFFE`, executes
the `INT 20h` (`CD 20`) at PSP offset 0, vectors through `0000:0080` to `F400:0150`, and the service trap
`FF FF CD 20` ends the program at `F400:0154` with `SP=FFFA`, which is the state shown in the classroom photo.

## Run scheduling

`EmulatorSession.tick` executes batches bounded by a 12 ms time budget (step delay 0), or one instruction per tick
(step delay > 0), and yields to the browser between batches through `requestAnimationFrame` / `setTimeout`.
Keyboard waits suspend Run until a key arrives. Every Run is bounded by a configurable instruction limit
(default 5 000 000). The UI therefore stays responsive even with endless loops (T008).

## Source mapping

Each emitted statement records `{line, address, length, isData}`. The machine maps every physical byte of the
loaded image to its statement, so the original-source window highlights the line of the instruction at CS:IP.
`ORG`, comments, labels and `EQU` produce no entries and are never highlighted. When CS:IP is outside the program
(PSP or ROM), the last program line stays highlighted, as in EMU8086.
