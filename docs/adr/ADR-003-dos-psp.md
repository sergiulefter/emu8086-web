# ADR-003: DOS / PSP contract

**Status:** accepted

## Decision
Follow the EMU8086 4.08 memory map (docs/research §7):
- The IVT at `0000:0000` points to 5-byte ROM stubs `FF FF CD nn CF` at segment `F400`. The CPU recognises
  `FF FF CD nn` as a service trap only inside the ROM segment. Handler offsets match 4.08: INT 20h at
  `F400:0150`, 21h at `0200`, 10h at `0190`, 16h at `01C0`, 1Ah at `0160`, 00h at `0170`, and so on. Unlisted
  vectors use `F400:0100`, which reports "INT nn is not supported". INT 19h points to `FFFF:0000`.
- **COM**: PSP at `0700:0000` (`CD 20`, top-of-memory `A000`, `INT 21h/RETF` at 50h, empty command tail).
  The image is at `0700:0100`, `CS=DS=ES=SS=0700`, `IP=0100`, `SP=FFFE`, `[SS:FFFE]=0000`,
  `CX` = program size (as in 4.08 screenshots), the other registers are 0, and IF=1.
- **BIN** (default.binf): loaded at `0100:0000` with all segments `0100`, `SP=FFFE`, `FF00` on the stack and a `HLT` at
  `0100:FF00`. `#LOAD_SEGMENT=…#`, `#CS=…#` and similar directives override this. `#make_boot#` loads at `0000:7C00`.
- Services operate on the interrupted program's registers. Flag results (CF, ZF) are written into the FLAGS
  word saved on the stack, so the stub's `IRET` returns them, as a real BIOS does.
- Keyboard input uses the standard BIOS ring buffer at `0040:001E`. A service that must wait rewinds IP to the
  trap and the session suspends Run until a key arrives.
- DOS console output goes through BIOS teletype into the same video RAM that the program can write directly.

## Consequences
Termination looks exactly like the classroom photo: `F400:0154`, `SP=FFFA`, and the same memory-list rows.
File, printer, mouse, disk and graphics services are not implemented. They stop with an explicit message instead
of pretending to succeed.
