import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { disassemble } from '../../src/cpu/disasm';
import { ENCODINGS } from './encodings.data';

const hexOf = (src: string) => {
  const r = assemble(src);
  if (!r.ok) throw new Error(r.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join('\n'));
  return Buffer.from(r.bytes).toString('hex');
};
const errorsOf = (src: string) => assemble(src).diagnostics.filter((d) => d.severity === 'error');

describe('instruction encodings (cross-checked with objdump)', () => {
  for (const [line, hex] of ENCODINGS) {
    it(line, () => expect(hexOf(`org 100h\n${line}`)).toBe(hex));
  }
});

describe('disassembler round trip', () => {
  for (const [line, hex] of ENCODINGS) {
    if (/:[0-9]/.test(line) && /call|jmp/.test(line)) continue; // far pointer literal syntax differs
    it(line, () => {
      const bytes = Buffer.from(hex, 'hex');
      const d = disassemble((o) => bytes[o - 0x100] ?? 0, 0x100);
      expect(d.length).toBe(bytes.length);
      expect(hexOf(`org 100h\n${d.text}`)).toBe(hex);
    });
  }
});

describe('numeric literals', () => {
  it.each([
    ['0B800h', 0xb800], ['0Fh', 0x0f], ['15', 15], ['15d', 15], ['0000_1111b', 0x0f],
    ['1101_1111b', 0xdf], ['17o', 15], ['0x1F', 0x1f], ["'H'", 0x48], ['041h', 0x41], ['-1', 0xffff],
  ])('%s', (lit, value) => {
    const r = assemble(`org 100h\nmov ax, ${lit}`);
    expect(r.ok).toBe(true);
    expect(r.bytes[1] | (r.bytes[2] << 8)).toBe(value);
  });

  it('rejects hex without leading digit with a helpful hint', () => {
    const [e] = errorsOf('org 100h\nmov ax, B800h');
    expect(e.message).toContain('write 0B800h');
  });

  it('rejects hex digits without h suffix', () => {
    const [e] = errorsOf('org 100h\nmov ax, 12AB');
    expect(e.message).toContain("need an 'h' suffix");
  });

  it('rejects out-of-range byte immediates', () => {
    const [e] = errorsOf('org 100h\nmov al, 300');
    expect(e.message).toContain('over 8 bits');
  });
});

describe('labels and jumps', () => {
  it('uses short jumps when in range and near jumps otherwise', () => {
    expect(hexOf('org 100h\nstart: jmp start')).toBe('ebfe');
    expect(hexOf('org 100h\njmp next\nnext: ret')).toBe('eb00c3');
    const far = assemble(`org 100h\njmp done\ndb 200 dup(90h)\ndone: ret`);
    expect(far.bytes[0]).toBe(0xe9);
    expect(far.bytes[1] | (far.bytes[2] << 8)).toBe(200);
  });

  it('converts out-of-range conditional jumps to opposite jump + JMP (EMU8086)', () => {
    const r = assemble(`org 100h\ncmp ax, 1\nje done\ndb 300 dup(0)\ndone: ret`);
    expect(r.ok).toBe(true);
    expect(Buffer.from(r.bytes.subarray(3, 8)).toString('hex')).toBe('7503e92c01');
    expect(r.notes.some((n) => n.includes('opposite jump'))).toBe(true);
  });

  it('conditional jump aliases', () => {
    expect(hexOf('org 100h\nl: jz l\njnz l\njc l\njnc l\njnge l\njpe l')).toBe('74fe75fc72fa73f87cf67af4');
  });

  it('LOOP out of range is an error (no automatic conversion)', () => {
    const [e] = errorsOf(`org 100h\nl: nop\ndb 200 dup(0)\nloop l`);
    expect(e.message).toMatch(/LOOP target is out of range/);
  });

  it('CALL/RET with PROC; RET inside FAR PROC becomes RETF', () => {
    expect(hexOf('org 100h\ncall p\nret\np proc\nret\np endp')).toBe('e80100c3c3');
    expect(hexOf('org 100h\nf proc far\nret\nf endp')).toBe('cb');
  });

  it('reports duplicate labels and missing ENDP', () => {
    expect(errorsOf('org 100h\na: nop\na: nop')[0].message).toMatch(/duplicate declaration of: a/);
    expect(errorsOf('org 100h\np proc\nret')[0].message).toMatch(/no ENDP for: P/);
  });
});

describe('data and variables', () => {
  it('DB strings, numbers, DUP, DW, DD', () => {
    expect(hexOf("db 'Hi', 0Dh, 0Ah, '$'")).toBe('48690d0a24');
    expect(hexOf('db 3 dup(1, 2)')).toBe('010201020102');
    expect(hexOf('dw 1234h, -1')).toBe('3412ffff');
    expect(hexOf('dd 12345678h')).toBe('78563412');
    expect(hexOf('x db ?')).toBe('00');
  });

  it('variables are memory operands with an implied size', () => {
    expect(hexOf('org 100h\nmov al, v\nmov v, 5\nret\nv db 7')).toBe('a00901c606090105c307');
    expect(hexOf('org 100h\nmov ax, w\nret\nw dw 7')).toBe('a10401c30700');
    expect(errorsOf('org 100h\nmov al, w\nret\nw dw 7')[0].message).toMatch(/operands do not match/);
  });

  it('OFFSET, LEA, indexed variables, LENGTH/SIZE', () => {
    expect(hexOf('org 100h\nmov dx, offset msg\nlea si, msg\nmov al, msg[bx]\nmov al, [msg+1]\nmov cx, length msg\nret\nmsg db 1,2,3')).toBe(
      'ba1201' + '8d361201' + '8a871201' + 'a01301' + 'b90300' + 'c3' + '010203',
    );
  });

  it('EQU constants and text EQU', () => {
    expect(hexOf('org 100h\nvideo equ 0B800h\nmov ax, video\nret')).toBe('b800b8c3');
    expect(hexOf('org 100h\ncrlf equ 13, 10\nmsg db crlf, "$"')).toBe('0d0a24');
    expect(hexOf('org 100h\nn = 5\nmov cx, n\nret')).toBe('b90500c3');
  });

  it('$ location counter', () => {
    expect(hexOf('org 100h\nmsg db "abc"\nlen equ $ - msg\nmov cx, len')).toBe('616263b90300');
  });
});

describe('8086 rules and EMU8086 conveniences', () => {
  it('segment register cannot be loaded with an immediate', () => {
    expect(errorsOf('org 100h\nmov ds, 0B800h')[0].message).toMatch(/cannot use segment register with an immediate value/);
  });

  it('memory-to-memory and size ambiguities are errors', () => {
    expect(errorsOf('org 100h\nmov [bx], [si]')[0].message).toMatch(/memory to memory/);
    expect(errorsOf('org 100h\ninc [bx]')[0].message).toMatch(/operand size is unknown/);
    expect(errorsOf('org 100h\nmov ax, [ax]')[0].message).toMatch(/only BX, BP, SI and DI/);
  });

  it('shift by an immediate count > 1 is expanded to repeated single shifts', () => {
    const r = assemble('org 100h\nshl ax, 3');
    expect(Buffer.from(r.bytes).toString('hex')).toBe('d1e0d1e0d1e0');
    expect(r.notes[0]).toMatch(/3 x/);
  });

  it('segment override prefixes', () => {
    expect(hexOf('org 100h\nmov al, es:[bx]\nmov [ss:bp+2], ax')).toBe('268a0736894602');
  });

  it('output type: COM with org 100h, BIN otherwise, #make_bin# directives', () => {
    expect(assemble('org 100h\nret').outputType).toBe('com');
    expect(assemble('mov ax, 1').outputType).toBe('bin');
    const r = assemble('#make_bin#\n#LOAD_SEGMENT=0500h#\n#CS=0500h#\nhlt');
    expect(r.outputType).toBe('bin');
    expect(r.binf.LOAD_SEGMENT).toBe(0x500);
  });

  it('unsupported directives produce honest diagnostics', () => {
    expect(errorsOf('.model small')[0].message).toMatch(/not supported/);
    expect(errorsOf("include 'emu8086.inc'")[0].message).toMatch(/INCLUDE is not supported/);
  });

  it('END entry must be 100h in a COM file', () => {
    expect(hexOf('org 100h\nstart: ret\nend start')).toBe('c3');
    expect(errorsOf('org 100h\nnop\nstart: ret\nend start')[0].message).toMatch(/wrong entry point/);
  });

  it('COMMENT blocks are skipped', () => {
    expect(hexOf('org 100h\ncomment *\nthis is not code\n*\nret')).toBe('c3');
  });
});
