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
      const read = (o: number) => bytes[o - 0x100] ?? 0;
      let d = disassemble(read, 0x100);
      let rest = hex;
      if ([0x26, 0x2e, 0x36, 0x3e, 0xf2, 0xf3, 0xf0].includes(bytes[0])) {
        // EMU8086 lists a prefix as its own one-byte instruction (ES:, REPE, REPNE …); the rest follows
        expect(d.length).toBe(1);
        expect(d.text).toMatch(/^(ES:|CS:|SS:|DS:|REPE|REPNE|LOCK)$/);
        d = disassemble(read, 0x101);
        rest = hex.slice(2);
      }
      expect(d.length * 2).toBe(rest.length);
      if (bytes[0] === 0x83 && bytes[2] & 0x80) {
        // EMU8086 shows the raw byte of a sign-extended immediate (ADC DX, -1 is "ADC DX, 0FFh"): no round trip
        expect(d.text).toMatch(/, 0[0-9A-F]{2}h$/);
        return;
      }
      expect(hexOf(`org 100h\n${d.text}`)).toBe(rest);
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

  it('OFFSET, LEA, indexed variables', () => {
    expect(hexOf('org 100h\nmov dx, offset msg\nlea si, msg\nmov al, msg[bx]\nmov al, [msg+1]\nmov bx, offset msg[2]\nret\nmsg db 1,2,3')).toBe(
      'ba1101' + 'be1101' + '8a871101' + 'a01201' + 'bb1301' + 'c3' + '010203',
    );
  });

  it('MASM operators that EMU8086 4.08 lacks are "wrong parameters"; their names are free', () => {
    // each of these fails in EMU8086 4.08 with "(2) wrong parameters: ..."
    for (const [line, op] of [
      ['MOV BL, HIGH 1234h', 'HIGH'], ['MOV BL, LOW 1234h', 'LOW'], ['MOV CX, TYPE w1', 'TYPE'],
      ['MOV CX, LENGTH w1', 'LENGTH'], ['MOV CX, SIZE w1', 'SIZE'], ['MOV BP, (10h SHL 2) OR 1', 'SHL'],
      ['MOV AX, 0F0Fh AND 00FFh', 'AND'], ['MOV AX, 17 MOD 5', 'MOD'], ['MOV AX, NOT 1', 'NOT'], ['MOV AX, 100h SHR 4', 'SHR'],
    ]) {
      const e = errorsOf(`org 100h\n${line}\nret\nw1 dw 1, 2`);
      expect(e[0].line).toBe(2);
      expect(e[0].message).toBe(`wrong parameters: EMU8086 has no ${op} operator`);
    }
    // EMU8086's cmpsb/cmpsw examples: `size = ($ - x1) / 2` ... `mov cx, size`
    expect(hexOf("org 100h\nmov cx, size\nret\nx1:\ns1 db 'ab'\ns2 db 'ab'\nsize = ($ - x1) / 2")).toBe('b90200c3' + '61626162');
  });

  it('a colon label before DB is a label: mov dx, msg loads its offset (EMU8086 HelloWorld example)', () => {
    // hi.com_ from EMU8086 4.08: EB 10 "Hello, World!" 0D 0A 24 BA 02 01 ...
    expect(hexOf('org 100h\njmp start\nmsg: db "Hi", 24h\nstart: mov dx, msg\nret')).toBe('eb03' + '486924' + 'ba0201' + 'c3');
  });

  it('a DD variable with a 16-bit register is a word access (EMU8086 double_word example)', () => {
    // EMU8086 4.08: `mov ax, binn` = A1 0E 01, `mov dx, [binn+2]` = 8B 16 10 01
    expect(hexOf('org 100h\nmov ax, d\nmov dx, [d+2]\nret\nd dd 12345678h')).toBe('a10801' + '8b160a01' + 'c3' + '78563412');
    expect(errorsOf('org 100h\nmov al, d\nret\nd dd 1')[0].message).toMatch(/DWORD/);
  });

  it('BYTE PTR / WORD PTR turns off the short accumulator form', () => {
    expect(hexOf('org 100h\nmov al, byte ptr w\nmov word ptr w, ax\nret\nw dw 1')).toBe('8a060901' + '89060901' + 'c3' + '0100');
  });

  it('LEA of a direct address is MOV reg, imm16 (EMU8086 4.08 listing)', () => {
    // Expected bytes copied from the lea.com_.list produced by EMU8086 4.08 for this exact source.
    const src = [
      'org 100h', 'lbl:',
      'LEA SI, x', 'LEA AX, x', 'LEA SI, [x]', 'LEA SI, x+2', 'LEA SI, w', 'LEA SI, lbl', 'LEA SP, x',
      'LEA SI, [1234h]', 'LEA SI, [BX]', 'LEA SI, x[BX]', 'LEA SI, [BX+SI+3]', 'LEA DI, [BP-2]',
      'LEA SI, ES:x', 'LEA BX, CS:[10h]',
      'ret', 'x DB 1,2,3,4', 'w DW 5',
    ].join('\n');
    expect(hexOf(src)).toBe(
      'be2d01' + 'b82d01' + 'be2d01' + 'be2f01' + 'be3101' + 'be0001' + 'bc2d01' + 'be3412' +
      '8d37' + '8db72d01' + '8d7003' + '8d7efe' + '26be2d01' + '2ebb1000' + 'c3' + '01020304' + '0500',
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

  it('memory-to-memory is an error; an unsized memory operand gets EMU8086 4.08 default size', () => {
    expect(errorsOf('org 100h\nmov [bx], [si]')[0].message).toMatch(/memory to memory/);
    // byte without an immediate or with one in -128..255, word otherwise (see fixtures/emu8086/unsized_operands*)
    expect(hexOf('org 100h\ninc [bx]\nmov [bx], 5\nmov [bx], 300')).toBe('fe07' + 'c60705' + 'c7072c01');
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
    expect(errorsOf("include 'other.inc'")[0].message).toMatch(/cannot open include file: other\.inc/);
  });

  it('END entry must be 100h in a COM file', () => {
    expect(hexOf('org 100h\nstart: ret\nend start')).toBe('c3');
    expect(errorsOf('org 100h\nnop\nstart: ret\nend start')[0].message).toMatch(/wrong entry point/);
  });

  it('COMMENT blocks are skipped', () => {
    expect(hexOf('org 100h\ncomment *\nthis is not code\n*\nret')).toBe('c3');
  });
});
