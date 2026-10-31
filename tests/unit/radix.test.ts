import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { evaluate } from '../../src/debug/calc';

function bytes(source: string): number[] {
  const result = assemble(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.ok).toBe(true);
  return Array.from(result.bytes);
}

// EMU8086 4.02 release notes, .RADIX examples and suffix precedence:
// https://raw.githubusercontent.com/surendrajat/emu8086/master/version.txt
describe('EMU8086 .RADIX', () => {
  it.each([
    [2, '101', 5], [16, '101', 0x101], [10, '20', 20], [8, '20', 16],
  ])('interprets %s-base %s as %s', (radix, literal, value) => {
    expect(bytes(`org 100h\n.radix ${radix}\nmov ax, ${literal}`)).toEqual([0xb8, value & 0xff, value >> 8]);
  });

  it('reads successive base selectors in decimal, including after base 2', () => {
    expect(bytes('org 100h\n.radix 2\ndb 101\n.radix 16\ndb 20\n.radix 10\ndb 20\n.radix 8\ndb 20'))
      .toEqual([5, 32, 20, 16]);
  });

  it.each([
    ['123D', 123], ['101B', 5], ['8F0Bh', 0x8f0b], ['0x8F0B', 0x8f0b],
    ['0ABCDh', 0xabcd], ['0ABCE', 0xabce], ['77o', 63], ['77q', 63],
  ])('honors explicit suffixes/prefixes and unsuffixed hex: %s', (literal, value) => {
    expect(bytes(`.radix 16\ndw ${literal}`)).toEqual([value & 0xff, value >> 8]);
  });

  it.each([
    ['8F0B', "invalid binary digit '8'", 4],
    ['0ABCD', "invalid decimal digit 'A'", 5],
  ])('rejects documented ambiguous suffix example %s', (literal, message, col) => {
    const result = assemble(`.radix 16\ndw ${literal}`);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', line: 2, col, message: expect.stringContaining(message) });
  });

  it.each([2, 8, 10, 16])('lets all explicit notations override base %s', (radix) => {
    expect(bytes(`.radix ${radix}\ndb 15d, 0Fh, 0000_1111b, 17o, 0x0F`)).toEqual([15, 15, 15, 15, 15]);
  });

  it.each([3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15])('accepts MASM-compatible intermediate base %s', (radix) => {
    expect(bytes(`.radix ${radix}\ndw 10`)).toEqual([radix, 0]);
  });

  it('preserves the radix of constants, text equates, and forward references across passes', () => {
    const source = 'org 100h\n.radix 16\nn equ 10\nitems equ 10, 20\nmov ax, finish-start+10\nstart:\n.radix 2\ndb items\ndb 10 dup(1)\nfinish:\nmov bx, n';
    expect(bytes(source)).toEqual([0xb8, 0x14, 0x00, 0x10, 0x20, 1, 1, 0xbb, 0x10, 0]);
  });

  it('applies to ORG, addresses, displacements, expressions, and negative values', () => {
    const result = assemble('.radix 16\norg 100\nmov ax, [bx+10]\ndb -10, 10+1');
    expect(result.ok).toBe(true);
    expect(result.origin).toBe(0x100);
    expect(result.outputType).toBe('com');
    expect(Array.from(result.bytes)).toEqual([0x8b, 0x47, 0x10, 0xf0, 0x11]);
  });

  it('does not change strings, comments, or the source mapping', () => {
    const result = assemble('org 100h\n; .radix 2\n.RaDiX 16 ; base selector\ndb "10 .radix 2", 10\ncomment *\n.radix 2\n*\nmov ax, 10');
    expect(result.ok).toBe(true);
    expect(Array.from(result.bytes)).toEqual([...Buffer.from('10 .radix 2'), 0x10, 0xb8, 0x10, 0]);
    expect(result.sourceMap.map((entry) => entry.line)).toEqual([4, 8]);
  });

  it('does not parse numeric-looking text on a COMMENT delimiter line', () => {
    expect(bytes('.radix 2\ncomment * 29 .radix 16 *\ndb 10')).toEqual([2]);
    expect(bytes('.radix 2\ncomment ! 29\n.radix 16\n!\ndb 10')).toEqual([2]);
  });

  it('keeps # register settings hexadecimal under .RADIX 2', () => {
    const result = assemble('#make_bin#\n.radix 2\n#AX=1234#\n#LOAD_SEGMENT=0500#\nhlt');
    expect(result.ok).toBe(true);
    expect(result.binf).toMatchObject({ AX: 0x1234, LOAD_SEGMENT: 0x500 });
  });

  it.each([
    [2, '102', "invalid binary digit '2'"],
    [8, '18', "invalid octal digit '8'"],
    [16, '0G', "invalid hexadecimal digit 'G'"],
  ])('locates invalid digits under base %s', (radix, literal, message) => {
    const result = assemble(`.radix ${radix}\n  db ${literal}`);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ line: 2, col: 5 + literal.length, length: 1, message: expect.stringContaining(message) });
  });

  it.each(['', '1', '17', '-2', '2, 16', '2 16', 'AX', '2+2', "'A'"])(
    'rejects an invalid selector %j without changing the previous radix', (selector) => {
      const result = assemble(`.radix 16\n.radix ${selector}\ndw 0ABCE`);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({ line: 2, message: expect.stringContaining('.RADIX needs one numeric base') });
    },
  );

  it('starts each new assembly with decimal, including after a failed assembly', () => {
    expect(bytes('.radix 16\ndb 10')).toEqual([16]);
    expect(bytes('db 10')).toEqual([10]);
    expect(assemble('.radix 2\ndb 2').ok).toBe(false);
    expect(bytes('db 10')).toEqual([10]);
  });

  it('leaves the debugger calculator in its own decimal default', () => {
    expect(bytes('.radix 16\ndb 10')).toEqual([16]);
    expect(evaluate('10 + 101b')).toBe(15);
  });
});
