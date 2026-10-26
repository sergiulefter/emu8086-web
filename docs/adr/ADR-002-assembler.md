# ADR-002: Assembler strategy

**Status:** accepted

## Context
Professor code must assemble unchanged (`0B800h`, `0000_1111b`, `'H'`, `org 100h`, top-level `RET`). EasyCPU
rejected `0000_1111b`. Rewriting the source text with regular expressions would risk changing comments and strings.

## Decision
Write a native EMU8086/MASM-dialect assembler in TypeScript (`src/assembler`):
- The line lexer recognises the numeric notations directly: `h`, `b`, `o`, `d` suffixes, `0x`, `_` digit
  separators and character constants. It reports the column of the offending digit. Text after `;` and inside
  quotes is never altered.
- Operands are parsed into expression trees in which registers and brackets are nodes, then classified as
  register, immediate or memory (MASM rule: a variable name means memory).
- Address assignment is multi-pass. Jumps only grow (short to near) so the passes converge. Out-of-range
  conditional jumps become an opposite jump plus `JMP`, which is documented EMU8086 behaviour. Shifts by an
  immediate count above 1 are expanded into repeated single shifts, as EMU8086 does.
- Encodings follow MASM choices (accumulator short forms, `83` sign-extended immediates, the `A0`–`A3` moffs
  forms). They were cross-checked against GNU objdump (`-m i8086`) for 106 instruction forms and frozen in
  `tests/unit/encodings.data.ts`.
- Every emitted statement produces a source-map entry.

## Consequences
MACRO, INCLUDE, EXE segments and `.MODEL` are not supported. They produce explicit diagnostics, and strict
operand-size checking matches the shipped EMU8086 4.08 configuration (`STRICT_SYNTAX=true`).
