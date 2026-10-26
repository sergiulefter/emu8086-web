# ADR-001: CPU core and licence

**Status:** accepted (2026-10-26)

## Context
Three existing engines, `daohainam/emulator-8086-js`, `crempp/js86emu` and `copy/v86`, were evaluated
before reusing any code. The candidates were inspected on 2026-10-26:

| Candidate | Revision | Licence | Findings | Verdict |
|---|---|---|---|---|
| daohainam/emulator-8086-js | e2a2a8d | **none** (no LICENSE file; GitHub API reports no licence) | React UI with its own assembler; licence unclear | **rejected**: all rights reserved by default |
| crempp/js86emu | adb88fd | MIT | full-PC oriented; prefix opcodes explicitly "not supported yet" (`8086.js` line 529); no assembler | rejected: incomplete for P0 |
| copy/v86 | cc37f35 | BSD-2-Clause | x86 PC emulator (486-class, JIT/WASM), needs BIOS images; no per-instruction 8086 flag semantics or source mapping | rejected: wrong level of abstraction |

## Decision
Implement a dedicated TypeScript 8086 interpreter (`src/cpu/cpu.ts`, about 1 000 lines). It has a single
`step()` API, a memory write journal for exact Step Back, and a ROM-only service trap. It is validated against
**SingleStepTests/8088 v2** (Daniel Balsom, MIT, revision `aea8448`). This is a hardware-captured suite of
about 2.9 million single-instruction tests run on an AMD D8088. The suite is downloaded on demand to `.cache/`
and is not bundled.

## Consequences
- All 323 opcode/group files pass, every test, with the suite's own undefined-flag masks. Two quirks were
  implemented because of it: `IDIV` with a `REP` prefix negates the quotient, and `AAM 0` updates SZP before
  trapping.
- The only masking beyond the suite's metadata applies to the FLAGS word that a divide error pushes, which is
  architecturally undefined (see `tests/conformance`).
- The four 80186 encodings that EMU8086 accepts (`PUSH imm`, `PUSHA`, `POPA`) run only when
  `cpu.allow186` is set. The app sets it; the conformance run keeps strict 8086 behaviour.
