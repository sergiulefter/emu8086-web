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

  it('a BIN program (no ORG 100h) gets the same NOP and HLT tail', () => {
    // EMU8086 4.08, `d cs:0 l 60` after loading this source: CS=0100 IP=0000, 90h at 0007-001A, F4h at 001B
    const m = load('mov ax, 1\nmov bx, 2\nret');
    expect(m.cpu.sregs[CS]).toBe(0x100);
    expect(m.cpu.ip).toBe(0);
    const bin = (offset: number, n: number) => Array.from({ length: n }, (_, i) => m.mem.read8(0x1000 + offset + i));
    expect(bin(0, 7)).toEqual([0xb8, 0x01, 0x00, 0xbb, 0x02, 0x00, 0xc3]);
    expect(bin(7, 20)).toEqual(new Array(20).fill(0x90));
    expect(bin(0x1b, 2)).toEqual([0xf4, 0x00]);
    // #make_boot# at 0000:7C00 (EMU8086 4.08 `d 0000:7c00 l 30`): B8 01 00 F4, 90h at 7C04-7C17, F4h at 7C18
    const boot = load('#make_boot#\norg 7c00h\nmov ax, 1\nhlt');
    const at = (a: number, n: number) => Array.from({ length: n }, (_, i) => boot.mem.read8(a + i));
    expect(at(0x7c00, 4)).toEqual([0xb8, 0x01, 0x00, 0xf4]);
    expect(at(0x7c04, 20)).toEqual(new Array(20).fill(0x90));
    expect(at(0x7c18, 2)).toEqual([0xf4, 0x00]);
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
    // EMU8086 lists the trap as a 2-byte BIOS DI followed by INT 020h and IRET...
    expect(m.disassembleFrom(0xf400, 0x150, 3).map((l) => [l.offset, l.d.text, l.d.length])).toEqual([
      [0x150, 'BIOS DI', 2], [0x152, 'INT 020h', 2], [0x154, 'IRET', 1],
    ]);
    // ...but executes all four bytes in one step and reports the DOS exit
    expect(m.step().stop?.reason).toBe('exit');
    expect(m.cpu.ip).toBe(0x154);
  });
});
