// .COM load layout and stepping results compared against EMU8086 4.08 running the same sources
// (memory read through its debug window `d 0700:0000` / `d 0700:0100` and the emulator registers).
import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { AX, CS, CX, SI, SP } from '../../src/cpu/cpu';
import { Machine } from '../../src/debug/machine';

function load(source: string) {
  const result = assemble(source);
  expect(result.diagnostics).toEqual([]);
  const machine = new Machine();
  machine.load(result, 'test.asm');
  return machine;
}

const bytes = (m: Machine, offset: number, n: number) => Array.from({ length: n }, (_, i) => m.mem.read8(0x7000 + offset + i));

describe('.COM load layout (EMU8086 4.08)', () => {
  it('PSP holds only INT 20h and an empty command tail', () => {
    const m = load('org 100h\nret');
    expect(bytes(m, 0, 2)).toEqual([0xcd, 0x20]);
    expect(bytes(m, 2, 0x7e).every((b) => b === 0)).toBe(true);
    expect(bytes(m, 0x80, 2)).toEqual([0x00, 0x0d]);
    expect(bytes(m, 0x82, 0x7e).every((b) => b === 0)).toBe(true);
  });

  it('places 20 NOPs and a HLT right after the image', () => {
    // i1 from the issue report: 11 bytes, NOPs at 010B-011E, HLT at 011F
    const m = load('org 100h\nMOV AL, var1\nMOV BX, var2\nRET\nvar1 DB 7\nvar2 DW 1234h');
    expect(m.cpu.regs[CX]).toBe(0x0b);
    expect(bytes(m, 0x100, 11)).toEqual([0xa0, 0x08, 0x01, 0x8b, 0x1e, 0x09, 0x01, 0xc3, 0x07, 0x34, 0x12]);
    expect(bytes(m, 0x10b, 20)).toEqual(new Array(20).fill(0x90));
    expect(bytes(m, 0x11f, 2)).toEqual([0xf4, 0x00]);
  });

  it('DUP data is followed by the NOP tail, not by more zeros', () => {
    const m = load("org 100h\nret\na DB 48h, 65h, 6Ch, 6Ch, 6Fh, 00h\nb DB 'Hello', 0\nx DB 10 DUP(0)\ny DB 5 DUP(1)");
    expect(m.cpu.regs[CX]).toBe(0x1c);
    expect(bytes(m, 0x10d, 10)).toEqual(new Array(10).fill(0));
    expect(bytes(m, 0x117, 5)).toEqual(new Array(5).fill(1));
    expect(bytes(m, 0x11c, 1)).toEqual([0x90]);
  });

  it('LEA SI,x then reading one byte past the data ends with AL=90h, CX=1Ah (issue 4)', () => {
    const src = ['org 100h', 'LEA SI,x', 'MOV AL,[SI]', ...Array(5).fill('INC SI\nMOV AL,[SI]'), 'ret', 'x DB  1,2,3,4,5'].join('\n');
    const m = load(src);
    expect(m.cpu.regs[CX]).toBe(0x1a);
    for (let i = 0; i < 12; i++) m.step();
    expect(m.cpu.ip).toBe(0x114);
    expect(m.cpu.regs[SI]).toBe(0x11a);
    expect(m.cpu.regs[AX] & 0xff).toBe(0x90);
    m.step(); // RET -> 0700:0000 (INT 20h)
    expect(m.cpu.ip).toBe(0);
    expect(m.cpu.regs[SP]).toBe(0);
    m.step(); // INT 20h -> F400:0150, the ROM trap `FF FF CD 20`
    expect(m.cpu.sregs[CS]).toBe(0xf400);
    expect(m.cpu.ip).toBe(0x150);
    expect(m.cpu.regs[SP]).toBe(0xfffa);
  });
});
