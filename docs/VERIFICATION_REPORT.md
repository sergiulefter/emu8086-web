# Verification report

> Part of **emu8086-web**, the free online 8086 assembler, emulator and debugger: [open the live emulator](https://emu8086.sergiulefter.com/) · [README and FAQ](../README.md) · [architecture](ARCHITECTURE.md) · [support matrix](SUPPORT_MATRIX.md) · [known differences](KNOWN_UI_DIFFERENCES.md) · [verification report](VERIFICATION_REPORT.md)

**Date:** 2026-10-26
**Environment:** Linux, Node 22.23.1, Chromium (Playwright build 1248), Firefox (Playwright build)

## Summary

| Suite | Command | Result |
|---|---|---|
| Unit + integration (Vitest) | `npm test` | **332 / 332 passed** (including 15 SEO and 3 licence tests) |
| End-to-end, Chromium + Firefox (Playwright) | `npm run test:e2e` | **36 / 36 passed** (18 scenarios × 2 browsers) |
| Production build SEO check | `npm run build && npm run check:seo` | passed (metadata, JSON-LD, relative asset paths, robots.txt, sitemap.xml, social image) |
| CPU hardware conformance (SingleStepTests/8088 v2, every test of every file) | `npm run test:conformance` | **323 / 323 opcode files passed** |
| Type check | `npm run typecheck` | clean |
| Clean checkout | `git archive` → `npm ci` → typecheck → test → build | passed |
| Production build | `npm run build` | 1 JS bundle (~740 kB, ~234 kB gzip); no runtime network references |

## Acceptance tests

| ID | Pri. | Verified by | Result | Evidence |
|---|---|---|---|---|
| **T001** professor's H | P0 | `tests/integration/acceptance.test.ts` "T001…" (2 tests); `tests/e2e/acceptance.spec.ts` "T001…" | **PASS** | Source pasted unchanged; bytes `B8 00 B8 8E D8 B1 48 B5 0F BB 00 00 89 0F C3`; `AX=B800 CX=0F48 BX=0000 DS=B800`; `B8000h = 48 0F`; canvas cell (0,0) lit and (0,1) dark; RET → `0700:0000` (`INT 020h`) → `F400:0150` → exit at `F400:0154`, `SP=FFFA`; 9 instructions (7 + INT 20h + trap); screen kept. Screenshot `screenshots/02-professor-H-stepped.png` |
| **T002** diagonal HELLO | P0 | integration "T002…" (both fixtures); e2e "T002…" | **PASS** | Cells (0,0)…(4,4) = H E L L O, attribute `0F`; offsets 0, A2h, 144h, 1E6h, 288h hold `48 0F`, `45 0F`, `4C 0F`, `4C 0F`, `4F 0F`; screen text `H\n E\n  L\n   L\n    O`. Screenshot `screenshots/03-diagonal-HELLO-terminated.png` reproduces classroom photo REF-04, including the register values and memory rows |
| **T003** step synchronization | P0 | integration "T003…"; e2e "T003…" | **PASS** | After each step: AX=B800 → DS=B800 → CL=48 → CH=0F → BX=0 → `48 0F`; highlighted source line goes 3, 4, 7, 8, 9, 10, 12 (never `org` on line 1 or the comment on line 6); memory list shows `B8000: 48 072 H` |
| **T004a** RET → PSP → DOS | P0 | integration "T004 a)" | **PASS** | Image is just `C3`; RET goes to `IP=0000` where the disassembly is `INT 020h`; exit |
| **T004b** INT 21h/4Ch | P0 | integration "T004 b)" | **PASS** | Exit code 00h after 3 instructions; no loop |
| **T004c** HLT | P0 | integration + e2e "T004c" | **PASS** | Stop reason `halt`, message "the emulator is halted." (distinct from DOS exit) |
| **T005** syntax + diagnostics | P0 | integration "T005…" (5 tests); unit `assembler.test.ts`; e2e "T005/J4" | **PASS** | `0000_1111b`, `0B800h`, `'H'`, `041h`, `162` and mixed case all accepted; `0000_1112b` gives "invalid binary digit '2'" at line 2, col 17; unknown directive and unknown instruction are located; INT 21h/3Dh stops with an explicit "not supported" message; comment and string bytes are untouched |
| **T006** segmentation / little-endian | P0 | integration "T006…" (2 tests) | **PASS** | DS=B800, BX=2, CX=1E41 gives `B8002=41`, `B8003=1E`, and B8000/1 unchanged; a word at offset FFFFh wraps within the segment |
| **T007** UI windows | P0 | e2e "T007…", "menus…", "compile…", "new file…" | **PASS** | Editor, emulator, screen, source and viewer are visible together; drag moves by exactly (60, 40); focus raises z-order; resize from the corner; minimize, then restore from the task bar with CPU state intact; maximize/restore; close and reopen source with the highlight intact |
| **T008** robustness | P0 | integration "T008…"; session tests; e2e "T008/J5", "T008: execution limit", "T008: a failed compile…" | **PASS** | Endless loop runs in time-sliced batches; the UI responds during Run (flags window opens, status updates); Stop and Reset work; the instruction limit reports "execution limit reached: 100,000 instructions"; a failed reload shows errors and does not run the stale binary. Browser measurement: 5 M instructions in 1.45 s, worst UI round trip 46 ms |
| **T009** extended value viewer | P1 | e2e "T009…" | **PASS** | AX=00F7: H 00, L F7, bin 11110111, oct 367, unsigned 247, signed −9, ascii ≈, 16-bit 247/247; typing −2 in "signed 16" sets AX=FFFE |
| **T010** step back | P1 | integration "T010…" (3 tests) + ring-buffer tests; e2e "T010…" | **PASS** | Undoing the word write restores `20 07` and all registers; stepping forward again gives the identical state. Step back also works across DOS termination, the PSP INT 20h, console output and consumed keyboard input. Excluded: external edits and typed keys (ADR-005) |

User journeys J1–J5 are covered by T001/T003 (J1, J3), T002 (J2), T005 (J4) and T008
(J5).

## Additional checks

- **CPU conformance**:
  - All 323 opcode/group files of SingleStepTests/8088 v2 pass (revision `aea8448`, about 2.9 M tests, 89 s).
  - The suite's per-opcode undefined-flag masks are used. Beyond that, the masks are applied only to the FLAGS
    word pushed by a divide error.
  - The prefix-only files and the "undefined" encodings, which the suite itself marks as undefined, are skipped.
  - Reproduce with `npm run test:conformance` (all tests; `CONFORMANCE_LIMIT=n` samples n per file).
- **Assembler encodings**: 106 instruction forms are cross-checked against GNU objdump 2.46 (`-m i8086`) and
  frozen in `tests/unit/encodings.data.ts`. Disassembling each of them and assembling the text again
  reproduces the bytes.
- **Examples**: all 10 bundled examples and the COM/BIN/BOOT templates assemble and run to a normal exit, with
  scripted keyboard input (`tests/integration/examples.test.ts`).
- **Throughput**: 2.56 M instructions/s in Node with full step-back journaling on a write-heavy loop, and
  6.5 M/s without journaling.
- **Visual review**: compared side by side with REF-01 to REF-05 at 1440×900 (Chromium) and 1366×768 (Firefox).
  Screenshots are in `docs/screenshots/`. Known deviations are listed in `KNOWN_UI_DIFFERENCES.md`.

## Independent code review
A separate review pass hunted for correctness bugs in the assembler, DOS environment and debugger, and confirmed
each one by running it. It found 12 bugs. All are fixed and each is locked in by a test in
`tests/integration/review-regressions.test.ts`:

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | wrong code | `mov cx, end_var - start_var` assembled as a memory load | variables are counted with their sign; a net-zero difference is an immediate |
| 2 | wrong emulation | `CALL` to a `PROC FAR` was near while its `RET` became `RETF` | emits `PUSH CS` + `CALL` (the MASM form) |
| 3 | wrong code | `alias EQU var` loaded the address instead of the memory | an EQU of a variable acts as that variable |
| 4 | wrong emulation | BIN `END label` entry was ignored by the loader | IP = load offset + (entry − origin) |
| 5 | false error | redefining with `=` never converged | each `=` statement is compared with its own previous value |
| 6 | false error | `RETF n` was rejected | supported (`CA iw`) |
| 7 | step back | undoing INT 21h/0Ch did not restore the flushed keys | a flush done by a service is journaled |
| 8 | debugger | retrying a waiting INT 21h/0Ah or 0Ch counted as a step | an unchanged retry no longer creates a new state |
| 9 | silent truncation | `add bx, 10005h` was accepted | 16-bit range check before choosing the `83` form |
| 10 | precedence | `NOT 1 + 1` = FFFFh | NOT now binds below + and −, as in MASM (FFFDh) |
| 11 | false error | `s equ 'hello'` | a string equate is a text equate |
| 12 | hang / memory | `db 65535 dup(65535 dup(0))` used about 2 GB of memory | aborts at once with "exceeds the 64 KB segment" |

The review also checked these and found them correct: negative displacements, forward references, every number
format, DUP and strings, segment overrides in every spelling, size inference, objdump agreement for all operand
forms, Jcc conversion boundaries, ORG gaps, INT 21h/0Ah editing, stacked-flag returns, teletype scrolling at the
bottom-right corner, INT 10h/13h, keyboard ring wrap, and exact step back across a full program. A 200 000-line
assembler fuzz run produced no crashes.

## Fixture paths
`fixtures/T001_professor_H.asm`, `T002_diagonal_HELLO.asm`, `T002b_classroom_HELLO.asm` (classroom listing
reconstruction), `T004a_ret_only.asm`, `T004b_int21_4c.asm`, `T004c_hlt.asm`, `T005_invalid_binary.asm`,
`T008_loop_forever.asm`, `hello_dos.asm`.
