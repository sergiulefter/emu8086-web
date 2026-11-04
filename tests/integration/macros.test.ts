// MACRO / LOCAL / INCLUDE compared with EMU8086 4.08. Each fixtures/macros/*.asm was compiled by the real
// EMU8086 4.08; *.emu8086.com is the executable it produced, which our assembler must reproduce byte for byte.
// Programs without a .com are ones EMU8086 rejects; the comment gives its error message.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../../src/assembler/assembler';
import { Machine } from '../../src/debug/machine';

const dir = join(process.cwd(), 'fixtures/macros');
const src = (name: string) => readFileSync(join(dir, `${name}.asm`), 'utf8');
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');

describe('macros reproduce EMU8086 4.08 output byte for byte', () => {
  const cases: [string, string][] = [
    ['m1_basic', 'parameters (tutorial example)'],
    ['m2_local', 'LOCAL labels used twice'],
    ['m3_inc', "include 'emu8086.inc': every macro and DEFINE_ procedure"],
    ['m4c', 'extra arguments are ignored'],
    ['m4f', 'PRINT with commas and quotes inside the string; bare INCLUDE name'],
    ['m5a', 'nested macros, case-insensitive names, label and comment on the call line'],
    ['m5c', 'arguments separated by blanks and tabs'],
    ['m5f', 'a label without LOCAL, used once'],
    ['m5g', 'textual substitution: M 5+5 with x*2 is 5+5*2'],
    ['m6b', 'parameters used as variable and label names'],
  ];
  for (const [name, what] of cases) {
    it(`${name}: ${what}`, () => {
      const r = assemble(src(name));
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(hex(r.bytes)).toBe(hex(readFileSync(join(dir, `${name}.emu8086.com`))));
    });
  }
});

describe('macro errors EMU8086 4.08 reports, on the same line', () => {
  const cases: [string, number, RegExp, string][] = [
    ['m4a', 11, /WORD/, '(11) wrong parameters: MOV DX, WORD (blanks split WORD PTR [SI] into three arguments)'],
    ['m4b', 6, /./, '(6) cannot be evaluated: undefined variable (missing argument is empty)'],
    ['m4d', 2, /M2/i, '(2) illegal instruction: M2 1, 2 (used before its definition)'],
    ['m4g', 4, /MACRO name already in use/, '(4) MACRO name already in use!'],
    ['m4h', 6, /LBL/i, '(6) duplicate declaration of: LBL (label without LOCAL, second call)'],
    ['m4i', 6, /./, '(6) cannot be evaluated: undefined variable (1,,3 collapses to two arguments)'],
    ['m5e', 5, /INS/i, '(5) illegal instruction: ins AX (no substitution in the instruction name)'],
  ];
  for (const [name, line, message, emu] of cases) {
    it(`${name}: ${emu}`, () => {
      const r = assemble(src(name));
      expect(r.ok).toBe(false);
      const errors = r.diagnostics.filter((d) => d.severity === 'error');
      expect(errors[0].line).toBe(line);
      expect(errors[0].message).toMatch(message);
    });
  }
});

describe('macro expansion details', () => {
  it('LOCAL labels are named NAME_LOC<n>TMP, n counting LOCAL lines across the program', () => {
    const r = assemble(src('m3_inc'));
    const names = r.symbols.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining([
      'S_DCL_LOC1TMP', 'S_DCL_LOC2TMP', 'MAKE_MINUS_LOC3TMP', 'TOO_BIG_LOC4TMP', 'STOP_INPUT_LOC5TMP',
      'NOT_CR_LOC6TMP', 'NEXT_CHAR_LOC7TMP', 'TEN_LOC9TMP', 'SKIP_PROC_PRINT_NUM_UNS_LOC10TMP', 'SKIP_PROC_CLEAR_SCREEN_LOC14TMP',
      'SCAN_NUM', 'PRINT_STRING', 'PTHIS', 'GET_STRING', 'CLEAR_SCREEN', 'PRINT_NUM', 'PRINT_NUM_UNS',
    ]));
  });

  it('every byte of a macro call maps to the call line (source window and break points)', () => {
    const r = assemble(src('m1_basic'));
    const lines = r.sourceMap.map((e) => [e.line, e.address, e.length]);
    expect(lines).toEqual([[7, 0x100, 3], [7, 0x103, 3], [7, 0x106, 3], [8, 0x109, 3], [8, 0x10c, 3], [8, 0x10f, 2], [9, 0x111, 1]]);
    const m = new Machine();
    m.load(r, 'm1.asm');
    expect(m.currentSourceLine()).toBe(7);
    m.step();
    expect(m.currentSourceLine()).toBe(7);
    m.step(); m.step();
    expect(m.currentSourceLine()).toBe(8);
  });

  it('an unknown include file is a clear error on the INCLUDE line', () => {
    const r = assemble("include 'mylib.inc'\norg 100h\nret");
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({ line: 1, col: 1 });
    expect(r.diagnostics[0].message).toMatch(/cannot open include file: mylib\.inc.*emu8086\.inc/);
  });

  it('errors inside an expansion point at the whole call line and name the macro', () => {
    const r = assemble('M MACRO\n MOV AX, BL\nENDM\norg 100h\n  M  ; call\nret');
    const e = r.diagnostics.find((d) => d.severity === 'error')!;
    expect(e).toMatchObject({ line: 5, col: 3, length: 1 });
    expect(e.message).toMatch(/\[in macro M: MOV AX, BL\]/);
  });

  it('a macro that calls itself stops with an error instead of hanging', () => {
    const r = assemble('M MACRO\n M\nENDM\norg 100h\nM\nret');
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => /expands too deeply/.test(d.message))).toBe(true);
  });

  it('MACRO text inside a COMMENT block is ignored', () => {
    const r = assemble('COMMENT *\nX MACRO\n*\norg 100h\nret');
    expect(r.ok).toBe(true);
    expect(hex(r.bytes)).toBe('C3');
  });

  it('missing ENDM is reported at the MACRO line', () => {
    const r = assemble('org 100h\nM MACRO\n NOP\nret');
    expect(r.diagnostics.some((d) => d.line === 2 && /no ENDM/.test(d.message))).toBe(true);
  });

  it('the fixtures exist', () => expect(existsSync(join(dir, 'm3_inc.emu8086.com'))).toBe(true));

  it('the bundled emu8086.inc is the unchanged EMU8086 4.08 file', () => {
    const inc = readFileSync(join(process.cwd(), 'src/assembler/includes/emu8086.inc'));
    expect(createHash('sha256').update(inc).digest('hex')).toBe('4d720f99c69eadcbb84ce87acd5f24b563ea06f36d6e7be2739012294c36f5f5');
  });
});
