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
- `cpu.emu8086` (set by the app, off for the conformance run) reproduces how EMU8086 4.08 steps and sets flags,
  as recorded from its debug.exe emulation (`fixtures/traces`, `tests/integration/emu8086Steps.test.ts`):
  - A prefix (`ES:`, `CS:`, `REPE`, `REPNE`, `LOCK`) is a step of its own. A REP string instruction does one
    iteration per step and returns to its prefix until CX is 0 or a compare ends it.
  - Undefined flags follow EMU8086: MUL/IMUL keep SF/ZF/AF/PF; AND/OR/XOR/TEST and all shifts keep AF; right
    shifts and rotates by more than one bit keep OF; AAM clears OF/AF/CF; DAA/DAS clear OF and change SF/ZF
    only with the 60h adjustment; AAA/AAS take SF/ZF from AH.
  - Two of its results differ from an 8086: DAS decides the 60h adjustment from the already adjusted AL
    (9Bh → 95h with CF=0), and SAHF also clears OF, DF, IF and TF.
