# Support matrix

> Part of **emu8086-web**, the free online 8086 assembler, emulator and debugger: [open the live emulator](https://emu8086.sergiulefter.com/) · [README and FAQ](../README.md) · [architecture](ARCHITECTURE.md) · [support matrix](SUPPORT_MATRIX.md) · [known differences](KNOWN_UI_DIFFERENCES.md) · [verification report](VERIFICATION_REPORT.md)

## Instructions (CPU and assembler)

The CPU executes every 8086/8088 opcode, including the undocumented aliases (60h–6Fh Jcc aliases, C0h/C1h/C8h/C9h,
D6h SALC, `POP CS`, shift group /6 SETMO). It is verified against all 323 opcode files of the SingleStepTests/8088
hardware suite. In the application, 60h/61h/68h/6Ah run as the 80186 PUSHA/POPA/PUSH-immediate forms, for
EMU8086 compatibility (ADR-001).

| Group | Mnemonics (assembler) | Notes |
|---|---|---|
| Data transfer | MOV, PUSH, POP, XCHG, XLAT/XLATB, IN, OUT, LEA, LDS, LES, LAHF, SAHF, PUSHF, POPF | `MOV sreg, imm` → error (EMU8086 message); `MOV CS, …` and `POP CS` → error |
| Arithmetic | ADD, ADC, SUB, SBB, CMP, INC, DEC, NEG, MUL, IMUL, DIV, IDIV, CBW, CWD, AAA, AAS, AAM, AAD, DAA, DAS | divide error → INT 0 → explicit stop message |
| Logic / shifts | AND, OR, XOR, NOT, TEST, SHL/SAL, SHR, SAR, ROL, ROR, RCL, RCR | count 1, CL, or an immediate up to 31 (expanded to repeated single shifts) |
| Strings | MOVSB/W, CMPSB/W, SCASB/W, LODSB/W, STOSB/W, MOVS/CMPS/SCAS/LODS/STOS with operands; REP/REPE/REPZ/REPNE/REPNZ | segment override on the source operand |
| Control | JMP (short/near/far, register, memory), CALL (near/far/register/memory), RET/RETN/RETF [n], Jcc (all 30 aliases), LOOP/LOOPE/LOOPZ/LOOPNE/LOOPNZ, JCXZ, INT, INT 3, INTO, IRET | out-of-range Jcc → opposite Jcc + JMP; out-of-range LOOP/JCXZ → error |
| Processor control | CLC, STC, CMC, CLD, STD, CLI, STI, HLT, NOP, WAIT/FWAIT, LOCK | ESC (FPU) → error |
| 80186 (EMU8086 accepts) | PUSH imm, PUSHA, POPA | assembled with a warning |

## Addressing modes
`[BX]`, `[BP]`, `[SI]`, `[DI]`, `[BX+SI]`, `[BX+DI]`, `[BP+SI]`, `[BP+DI]`, each with an optional 8- or 16-bit
displacement; direct `[1234h]`; variables (`var`, `var[BX]`, `[var+2]`, `var+2[SI]`); segment overrides
(`ES:[DI]`, `[ES:DI]`, `CS:var`). `BP`-based addresses default to SS. Size comes from the register,
`BYTE/WORD/DWORD PTR`, `b.`/`w.`, or the variable type. An ambiguous size is an error.

## Directives and syntax
| Item | Status |
|---|---|
| `ORG`, `DB`, `DW`, `DD`, `n DUP(…)` (nested), `?`, strings `'…'` / `"…"` with doubled quotes | supported |
| `EQU` (numeric, text, strings; an EQU of a variable acts as that variable), `=` (redefinable) | supported |
| `name PROC [NEAR\|FAR]` / `name ENDP` (names must match; RET in a FAR PROC → RETF; `CALL far_proc` → `PUSH CS` + `CALL`), `END [label]` (also the BIN entry point) | supported |
| `NAME`, `TITLE`, `PAGE`, `ASSUME`, `.8086`, `.186`, `SUBTTL` | accepted and ignored |
| `COMMENT <delim> … <delim>` | supported |
| `OFFSET`, `HIGH`, `LOW`, `LENGTH`, `SIZE`, `TYPE`, `SHORT`, `NEAR PTR`, `FAR PTR`, `$` | supported |
| operators `+ - * / MOD SHL SHR AND OR XOR NOT`, parentheses | supported |
| numbers: `162`, `162d`, `0B800h`, `0x1F`, `0000_1111b`, `17o`, `17q`, `'A'`, `'AB'` | supported (`q` is an extra) |
| `.RADIX base` | supported: numeric base 2–16, decimal selectors; explicit suffixes and `0x` override the default |
| `#make_com#`, `#make_bin#`, `#make_boot#`, `#LOAD_SEGMENT=…#`, `#LOAD_OFFSET=…#`, `#CS=…#` … `#SP=…#`, `#AX=…#`, `#AL=…#` … | supported |
| `#MEM=address,bytes-address,bytes#` | supported for BIN/boot: physical or segment:offset addresses, hexadecimal byte strings; reapplied on reset/reload |
| `#make_exe#`, `.MODEL`, `.DATA`, `.CODE`, `.STACK`, `SEGMENT/ENDS`, `MACRO/ENDM/LOCAL`, `INCLUDE`, `LABEL`, `EXTRN/PUBLIC`, `DQ`, `DT`, `SEG` | explicit "not supported" diagnostic |
| `#fasm#`, `#masm#`, `#start=…#` | warning, ignored |

`.RADIX` starts at decimal for each assembly and affects subsequent unsuffixed literals, including data,
expressions and addresses. Base selectors themselves use decimal unless explicitly suffixed. EMU8086's
[release notes](https://raw.githubusercontent.com/surendrajat/emu8086/master/version.txt) document bases
2/8/10/16 and suffix priority: under base 16, `123D` is decimal 123 and `101B` is binary 5;
`8F0B` and `0ABCD` are errors, while `8F0Bh`, `0ABCDh` and `0ABCE` are valid.
Intermediate bases are accepted using MASM's [2–16 range](https://learn.microsoft.com/en-us/cpp/assembler/masm/dot-radix).
Only a single numeric base selector is implemented; expressions or symbol names as selectors are rejected.
These behaviors are checked against documentation and regression tests, not against a running EMU8086 binary.

`#MEM` follows the [compiler documentation](https://surendrajat.github.io/emu8086/documentation/compiler.html):
addresses and byte strings are hexadecimal independently of `.RADIX`, each byte has two digits, spaces
inside byte strings are ignored, and `-` separates entries. For example, `#MEM=0100:0200,3412#` initializes
the word at `0100:0200` to `1234h`. These presets are loader metadata, not bytes appended to the executable.
They replace the default BIN stack/HLT presets. COM use produces an explicit diagnostic.

Implementation policies where the documentation is silent: entries (including repeated `#MEM` lines)
are applied in source order after loading the executable, so later writes win. Segment and offset must
fit in 16 bits; physical addresses must be within `0`–`FFFFF`. Logical addresses and byte streams wrap
on the existing 20-bit memory bus; byte streams advance through physical memory, not within a segment.
One byte string is limited to 1 MiB. These policies are tested but have not been compared with EMU8086.
Raw `.bin` files do not carry presets; importing/exporting external `.binf` sidecars is not implemented.

## Interrupt services
| Vector | Functions | Notes |
|---|---|---|
| INT 21h | 00h, 01h, 02h, 06h, 07h, 08h, 09h, 0Ah, 0Bh, 0Ch, 25h, 2Ah, 2Ch, 35h, 4Ch | 09h fails after 2000 bytes without `$`; 0Ah supports backspace; 4Ch reports the exit code |
| INT 20h | terminate | |
| INT 10h | 00h (modes 0–3, 7), 01h, 02h, 03h, 05h, 06h, 07h, 08h, 09h, 0Ah, 0Eh, 0Fh, 13h, 1003h | graphics modes → explicit stop |
| INT 16h | 00h, 01h, 02h, 10h, 11h | wait / peek with ZF in the returned flags |
| INT 11h, INT 12h | equipment word, 640 KB | |
| INT 15h | 86h wait | Run pauses for CX:DX µs |
| INT 1Ah | 00h tick count | host clock |
| INT 19h | reboot → stop | "program requested reboot. the emulator halted." |
| INT 00h, 01h, 03h, 04h | divide error, single-step, breakpoint, INTO | stop with a message unless the program installs a handler |
| anything else | — | stops with "INT nn … is not supported" |

Programs can install their own handlers with INT 21h/25h or by writing the IVT; the CPU then vectors to them.

## Port I/O
`IN` returns FFh/FFFFh and `OUT` is ignored. Both are logged in the debug window ("no device attached").
