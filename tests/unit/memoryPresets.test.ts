import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';

function presets(source: string) {
  const result = assemble(source);
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  return result.memoryPresets.map(({ address, bytes }) => ({ address, bytes: Array.from(bytes) }));
}

// EMU8086 compiler help, #MEM format and examples:
// https://surendrajat.github.io/emu8086/documentation/compiler.html
describe('EMU8086 #MEM', () => {
  it('parses the documented physical-address example', () => {
    expect(presets('#MEM=1000,01ABCDEF0122-0200,1233#')).toEqual([
      { address: 0x1000, bytes: [1, 0xab, 0xcd, 0xef, 1, 0x22] },
      { address: 0x200, bytes: [0x12, 0x33] },
    ]);
  });

  it('parses the documented default.binf stack and HLT example', () => {
    expect(presets('#MEM=0100:FFFE,00FF-0100:FF00,F4#')).toEqual([
      { address: 0x10ffe, bytes: [0, 0xff] },
      { address: 0x10f00, bytes: [0xf4] },
    ]);
  });

  it('accepts case differences, whitespace and a trailing comment', () => {
    expect(presets('  # mem = 0100 : 0200 , 3 4\t1 2 - 01202 , ab CD # ; data')).toEqual([
      { address: 0x1200, bytes: [0x34, 0x12] }, { address: 0x1202, bytes: [0xab, 0xcd] },
    ]);
  });

  it.each([
    ['00000', 0], ['FFFFF', 0xfffff], ['FFFF:000F', 0xfffff],
    ['FFFF:0010', 0], ['FFFF:FFFF', 0xffef], ['0000001000', 0x1000],
  ])('normalizes valid address %s using the 20-bit machine address space', (address, expected) => {
    expect(presets(`#MEM=${address},AB#`)).toEqual([{ address: expected, bytes: [0xab] }]);
  });

  it('keeps all address and byte values hexadecimal under .RADIX 2', () => {
    expect(presets('.radix 2\n#MEM=0100:0200,3412#')).toEqual([{ address: 0x1200, bytes: [0x34, 0x12] }]);
  });

  it('records entries and repeated directives in source order without emitting bytes', () => {
    const source = '#make_bin#\n#MEM=1200,01-1200,02#\nmov ax,1\n#MEM=1200,03#\nhlt';
    expect(presets(source)).toEqual([1, 2, 3].map((value) => ({ address: 0x1200, bytes: [value] })));
    const result = assemble(source);
    expect(Array.from(result.bytes)).toEqual([0xb8, 1, 0, 0xf4]);
    expect(result.sourceMap.map(({ line }) => line)).toEqual([3, 5]);
  });

  it('accepts BIN at ORG 100h and boot programs', () => {
    expect(presets('#make_bin#\norg 100h\n#MEM=1200,34#\nhlt')).toHaveLength(1);
    expect(presets('#make_boot#\norg 7c00h\n#MEM=1200,34#\nhlt')).toHaveLength(1);
  });

  it('ignores directives inside comments, strings, or after END', () => {
    expect(presets('; #MEM=1200,34#\ncomment *\n#MEM=1200,34#\n*\ndb "#MEM=1200,34#"\nend\n#MEM=1200,34#')).toEqual([]);
  });

  it.each(['org 100h', '#make_com#\norg 100h'])(
    'rejects #MEM in a COM program instead of silently ignoring it', (prefix) => {
      const result = assemble(`${prefix}\n#MEM=1200,3412#\nret`);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual([expect.objectContaining({ severity: 'error', message: expect.stringContaining('only for BIN/boot') })]);
    },
  );

  it.each([
    '#MEM#', '#MEM=1200,34', '#MEM=1200,34# garbage', '#MEM=1200,34##',
    '#MEM=#', '#MEM=1200#', '#MEM=,34#', '#MEM=1200,#', '#MEM=1200,1#',
    '#MEM=1200,123#', '#MEM=1200,GG#', '#MEM=1200,01,02#', '#MEM=1200,0x12#',
    '#MEM=0x1200,12#', '#MEM=1200h,12#', '#MEM=100000,12#',
    '#MEM=10000:0000,12#', '#MEM=0000:10000,12#', '#MEM=1:2:3,12#',
    '#MEM=:0200,12#', '#MEM=0100:,12#', '#MEM=-1200,12#', '#MEM=1200,12-#',
    '#MEM=1200,12--1300,34#', '#MEM=FFFFFFFFFFFFFFFFFFFFFFFF,12#',
  ])('reports malformed or out-of-range input: %s', (directive) => {
    const result = assemble(directive);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', line: 1, message: expect.stringContaining('#MEM') });
    expect(result.memoryPresets).toEqual([]);
  });

  it('locates the exact invalid byte digit in the original source', () => {
    const source = '  #MEM=1200,34-1300,0G#';
    const result = assemble(`hlt\n${source}`);
    expect(result.diagnostics[0]).toMatchObject({ line: 2, col: source.indexOf('G') + 1, length: 1 });
  });

  it('does not publish partial entries from a malformed directive', () => {
    const result = assemble('#MEM=1200,34-1300,0G#');
    expect(result.ok).toBe(false);
    expect(result.memoryPresets).toEqual([]);
  });

  it('rejects byte strings larger than the machine memory before allocating them', () => {
    const result = assemble(`#MEM=0,${'00'.repeat(0x100001)}#`);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toContain('cannot exceed 1 MiB');
  });

  it('does not leak presets into subsequent assemblies', () => {
    expect(presets('#MEM=1200,34#')).toHaveLength(1);
    expect(presets('hlt')).toEqual([]);
  });
});
