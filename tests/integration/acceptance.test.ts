/**
 * Acceptance tests T001–T010, run on
 * the real assembler + CPU + DOS environment, with fixtures pasted unchanged.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../../src/assembler/assembler';
import { Machine } from '../../src/debug/machine';
import { AX, BX, CX, CS, DS, SP, SS, ES } from '../../src/cpu/cpu';

const fixture = (name: string) => readFileSync(join(process.cwd(), 'fixtures', name), 'utf8');

function load(name: string): Machine {
  const r = assemble(fixture(name));
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const m = new Machine();
  m.load(r, name);
  return m;
}

function runToEnd(m: Machine, max = 10_000) {
  for (let i = 0; i < max; i++) {
    const r = m.step();
    if (r.stop) return r.stop;
  }
  throw new Error('program did not stop');
}

const hex = (v: number) => v.toString(16).toUpperCase().padStart(4, '0');

describe('T001 professor H program', () => {
  it('assembles unchanged to the expected machine code', () => {
    const r = assemble(fixture('T001_professor_H.asm'));
    expect(r.ok).toBe(true);
    expect(r.diagnostics).toEqual([]);
    expect(r.outputType).toBe('com');
    expect(r.origin).toBe(0x100);
    expect(Buffer.from(r.bytes).toString('hex')).toBe('b800b88ed8b148b50fbb0000890fc3');
    // org and comment emit nothing; 7 instructions mapped to their source lines
    expect(r.sourceMap.map((e) => e.line)).toEqual([3, 4, 7, 8, 9, 10, 12]);
  });

  it('writes 48 0F to B800:0000, shows a bright-white H and returns to DOS via PSP INT 20h', () => {
    const m = load('T001_professor_H.asm');
    // Initial COM state (EMU8086 4.08 layout)
    expect(m.cpu.sregs[CS]).toBe(0x0700);
    expect(m.cpu.ip).toBe(0x0100);
    expect(m.cpu.regs[SP]).toBe(0xfffe);
    expect(m.mem.read16(0x0700, 0xfffe)).toBe(0x0000);
    expect([m.mem.read8(0x7000), m.mem.read8(0x7001)]).toEqual([0xcd, 0x20]);

    for (let i = 0; i < 6; i++) expect(m.step().executed).toBe(true);
    expect(m.cpu.regs[AX]).toBe(0xb800);
    expect(m.cpu.regs[CX]).toBe(0x0f48);
    expect(m.cpu.regs[BX]).toBe(0x0000);
    expect(m.cpu.sregs[DS]).toBe(0xb800);
    expect(m.mem.read8(0xb8000)).toBe(0x48);
    expect(m.mem.read8(0xb8001)).toBe(0x0f);
    const cell = m.env.screen.getCell(0, 0);
    expect(cell.glyph).toBe('H');
    expect(cell.fg).toBe(15);
    expect(cell.bg).toBe(0);

    // RET pops 0000 → PSP:0000
    let r = m.step();
    expect(r.stop).toBeNull();
    expect(hex(m.cpu.sregs[CS]) + ':' + hex(m.cpu.ip)).toBe('0700:0000');
    expect(m.disassembleAt(0x0700, 0).text).toBe('INT 020h');
    // INT 20h → IVT → F400:0150 (EMU8086 handler address)
    r = m.step();
    expect(r.stop).toBeNull();
    expect(hex(m.cpu.sregs[CS]) + ':' + hex(m.cpu.ip)).toBe('F400:0150');
    // the service trap terminates; state matches the classroom photo (F400:0154, SP=FFFA)
    r = m.step();
    expect(r.stop?.reason).toBe('exit');
    expect(r.stop?.message).toBe('PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM');
    expect(hex(m.cpu.sregs[CS]) + ':' + hex(m.cpu.ip)).toBe('F400:0154');
    expect(m.cpu.regs[SP]).toBe(0xfffa);
    expect(m.cpu.sregs[SS]).toBe(0x0700);
    expect(m.cpu.sregs[ES]).toBe(0x0700);
    // 7 program instructions + INT 20h + service trap
    expect(m.cpu.instructionCount).toBe(9);
    // screen content survives termination
    expect(m.env.screen.getCell(0, 0).glyph).toBe('H');
    expect(m.step().executed).toBe(false);
  });
});

describe('T002 diagonal HELLO', () => {
  for (const file of ['T002_diagonal_HELLO.asm', 'T002b_classroom_HELLO.asm']) {
    it(`${file}: letters on the diagonal with attribute 0F and normal exit`, () => {
      const m = load(file);
      const stop = runToEnd(m);
      expect(stop.reason).toBe('exit');
      const expected: [number, number, string][] = [[0, 0, 'H'], [1, 1, 'E'], [2, 2, 'L'], [3, 3, 'L'], [4, 4, 'O']];
      const offsets = [0x0000, 0x00a2, 0x0144, 0x01e6, 0x0288];
      expected.forEach(([row, col, ch], i) => {
        const cell = m.env.screen.getCell(row, col);
        expect(cell.glyph).toBe(ch);
        expect(cell.attr).toBe(0x0f);
        expect(m.mem.read8(0xb8000 + offsets[i])).toBe(ch.charCodeAt(0));
        expect(m.mem.read8(0xb8000 + offsets[i] + 1)).toBe(0x0f);
      });
      expect(m.env.screen.text()).toBe('H\n E\n  L\n   L\n    O');
      expect(m.cpu.regs[BX]).toBe(0x0288);
      expect(m.cpu.regs[CX]).toBe(0x0f4f);
    });
  }
});

describe('T003 step synchronization', () => {
  it('updates registers, memory, screen and source line on each single step', () => {
    const m = load('T001_professor_H.asm');
    expect(m.currentSourceLine()).toBe(3);
    const expectations: [number, () => void][] = [
      [4, () => expect(m.cpu.regs[AX]).toBe(0xb800)],
      [7, () => expect(m.cpu.sregs[DS]).toBe(0xb800)],
      [8, () => expect(m.cpu.regs[CX] & 0xff).toBe(0x48)],
      [9, () => expect(m.cpu.regs[CX] >> 8).toBe(0x0f)],
      [10, () => expect(m.cpu.regs[BX]).toBe(0)],
      [12, () => {
        expect(m.mem.read8(0xb8000)).toBe(0x48);
        expect(m.mem.read8(0xb8001)).toBe(0x0f);
        expect(m.env.screen.getCell(0, 0).glyph).toBe('H');
      }],
    ];
    for (const [nextLine, check] of expectations) {
      if (nextLine < 12) expect(m.mem.read8(0xb8000)).toBe(0x20);
      m.step();
      check();
      // highlight moves to the next executable line; org (1) and the comment (6) are never current
      expect(m.currentSourceLine()).toBe(nextLine);
    }
  });
});

describe('T004 DOS termination modes', () => {
  it('a) RET executes as a real near RET into the PSP INT 20h', () => {
    const m = load('T004a_ret_only.asm');
    expect(assemble(fixture('T004a_ret_only.asm')).bytes).toEqual(new Uint8Array([0xc3]));
    m.step();
    expect(m.cpu.ip).toBe(0);
    expect(m.disassembleAt(0x0700, 0).text).toBe('INT 020h');
    expect(runToEnd(m).reason).toBe('exit');
  });

  it('b) INT 21h AH=4Ch exits with code 00h', () => {
    const m = load('T004b_int21_4c.asm');
    const stop = runToEnd(m);
    expect(stop.reason).toBe('exit');
    expect(stop.exitCode).toBe(0);
    expect(m.cpu.instructionCount).toBe(3); // MOV, INT, service trap
  });

  it('c) HLT reports a hardware halt, distinct from DOS exit', () => {
    const m = load('T004c_hlt.asm');
    const stop = runToEnd(m);
    expect(stop.reason).toBe('halt');
    expect(stop.message).toBe('the emulator is halted.');
  });
});

describe('T005 strict syntax and diagnostics', () => {
  it('accepts EMU8086 numeric notations', () => {
    const r = assemble("org 100h\nmov ch, 0000_1111b\nMOV AX, 0B800h\nmov cl, 'H'\nmov cl, 041h\nAdd Bx, 162\nret ; comment 'x' 0000_1112b");
    expect(r.ok).toBe(true);
    expect(Buffer.from(r.bytes).toString('hex')).toBe('b50f' + 'b800b8' + 'b148' + 'b141' + '81c3a200' + 'c3');
  });

  it('reports an invalid binary digit with line and column', () => {
    const r = assemble(fixture('T005_invalid_binary.asm'));
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({ severity: 'error', line: 2, col: 17, message: "invalid binary digit '2' in '0000_1112b'" });
  });

  it('reports unknown directives and instructions with location', () => {
    const r = assemble('org 100h\n.foo 5\nfrobnicate ax\nret');
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => [d.line, d.col])).toEqual([[2, 1], [3, 1]]);
  });

  it('stops with an explicit message on an unsupported interrupt service (no hang)', () => {
    const r = assemble('org 100h\nmov ah, 3Dh\nint 21h\nret');
    const m = new Machine();
    m.load(r, 'x.asm');
    const stop = runToEnd(m, 100);
    expect(stop.reason).toBe('unsupported');
    expect(stop.message).toMatch(/INT 21h function 3Dh is not supported/);
  });

  it('never mutates comments or strings', () => {
    const src = "org 100h\nmsg db 'B800h 0000_1112b ; not a comment$' ; MOV 0B800h\nret";
    const r = assemble(src);
    expect(r.ok).toBe(true);
    expect(Buffer.from(r.bytes.subarray(0, 32)).toString('latin1')).toBe("B800h 0000_1112b ; not a comment");
  });
});

describe('T006 segmentation and little-endian word writes', () => {
  it('MOV [BX], CX with DS=B800h, BX=2, CX=1E41h writes B8002h=41h, B8003h=1Eh only', () => {
    const r = assemble('org 100h\nmov ax, 0B800h\nmov ds, ax\nmov bx, 2\nmov cx, 1E41h\nmov [bx], cx\nret');
    const m = new Machine();
    m.load(r, 't6.asm');
    const before = [m.mem.read8(0xb8000), m.mem.read8(0xb8001)];
    for (let i = 0; i < 5; i++) m.step();
    expect(m.mem.read8(0xb8002)).toBe(0x41);
    expect(m.mem.read8(0xb8003)).toBe(0x1e);
    expect([m.mem.read8(0xb8000), m.mem.read8(0xb8001)]).toEqual(before);
    expect((m.cpu.sregs[DS] << 4) + m.cpu.regs[BX]).toBe(0xb8002);
  });

  it('word access at offset FFFFh wraps inside the segment', () => {
    const r = assemble('org 100h\nmov ax, 2000h\nmov ds, ax\nmov bx, 0FFFFh\nmov word ptr [bx], 1234h\nret');
    const m = new Machine();
    m.load(r, 'wrap.asm');
    for (let i = 0; i < 4; i++) m.step();
    expect(m.mem.read8(0x2ffff)).toBe(0x34);
    expect(m.mem.read8(0x20000)).toBe(0x12);
  });
});

describe('T008 robustness', () => {
  it('an infinite loop runs in bounded slices and can be stopped and reset', () => {
    const m = load('T008_loop_forever.asm');
    const r = m.run(100_000);
    expect(r.count).toBe(100_000);
    expect(r.stop).toBeNull();
    expect(m.cpu.ip).toBe(0x100);
    m.reset();
    expect(m.cpu.instructionCount).toBe(0);
    expect(m.cpu.ip).toBe(0x100);
    expect(m.mem.read8(0x7000)).toBe(0xcd);
  });

  it('a failed compile produces no program to execute', () => {
    const r = assemble('org 100h\nmov ax, \nret');
    expect(r.ok).toBe(false);
    const m = new Machine();
    expect(() => m.load(r, 'bad.asm')).toThrow();
  });
});

describe('T010 step back', () => {
  it('restores B800 bytes and CPU state exactly, and forward again reproduces it', () => {
    const m = load('T001_professor_H.asm');
    for (let i = 0; i < 5; i++) m.step();
    const regsBefore = [...m.cpu.regs, ...m.cpu.sregs, m.cpu.ip, m.cpu.flags];
    const bytesBefore = [m.mem.read8(0xb8000), m.mem.read8(0xb8001)];
    m.step(); // MOV [BX], CX
    expect([m.mem.read8(0xb8000), m.mem.read8(0xb8001)]).toEqual([0x48, 0x0f]);
    const regsAfter = [...m.cpu.regs, ...m.cpu.sregs, m.cpu.ip, m.cpu.flags];
    expect(m.stepBack()).toBe(true);
    expect([m.mem.read8(0xb8000), m.mem.read8(0xb8001)]).toEqual(bytesBefore);
    expect([...m.cpu.regs, ...m.cpu.sregs, m.cpu.ip, m.cpu.flags]).toEqual(regsBefore);
    m.step();
    expect([m.mem.read8(0xb8000), m.mem.read8(0xb8001)]).toEqual([0x48, 0x0f]);
    expect([...m.cpu.regs, ...m.cpu.sregs, m.cpu.ip, m.cpu.flags]).toEqual(regsAfter);
  });

  it('can step back over DOS termination and the PSP INT 20h', () => {
    const m = load('T001_professor_H.asm');
    runToEnd(m);
    expect(m.stopEvent?.reason).toBe('exit');
    m.stepBack();
    expect(m.stopEvent).toBeNull();
    expect(hex(m.cpu.sregs[CS]) + ':' + hex(m.cpu.ip)).toBe('F400:0150');
    m.stepBack();
    m.stepBack();
    expect(hex(m.cpu.sregs[CS]) + ':' + hex(m.cpu.ip)).toBe('0700:010E');
    expect(m.cpu.regs[SP]).toBe(0xfffe);
    expect(runToEnd(m).reason).toBe('exit');
  });

  it('can step back over console output and keyboard input', () => {
    const r = assemble("org 100h\nmov ah, 1\nint 21h\nmov dl, al\nmov ah, 2\nint 21h\nret");
    const m = new Machine();
    m.load(r, 'io.asm');
    m.step(); m.step(); // MOV AH,1 / INT 21h → F400:0200
    const w = m.step();
    expect(w.waiting).toBe(true);
    m.env.pushKey(0x61, 0x1e);
    expect(m.step().executed).toBe(true);
    expect(m.cpu.regs[AX] & 0xff).toBe(0x61);
    expect(m.env.screen.getCell(0, 0).glyph).toBe('a');
    m.stepBack();
    expect(m.env.screen.getCell(0, 0).glyph).toBe(' ');
    expect(m.env.keyboardCount()).toBe(1); // key is back in the buffer
    m.step();
    expect(m.env.screen.getCell(0, 0).glyph).toBe('a');
  });
});

describe('DOS console output', () => {
  it('INT 21h/09h prints a $-terminated string at the cursor', () => {
    const m = load('hello_dos.asm');
    const stop = runToEnd(m);
    expect(stop.reason).toBe('exit');
    expect(m.env.screen.text()).toBe('Hello, World!');
    expect(m.env.screen.getCursor()).toEqual({ row: 0, col: 13 });
  });
});

describe('EMU8086 80186 compatibility forms', () => {
  it('PUSH immediate, PUSHA and POPA assemble (with a warning) and execute', () => {
    const r = assemble('org 100h\nmov ax, 1111h\nmov bx, 2222h\npush 1234h\npop cx\npusha\nmov ax, 0\npopa\nret');
    expect(r.ok).toBe(true);
    expect(r.diagnostics.filter((d) => d.severity === 'warning').length).toBe(3);
    const m = new Machine();
    m.load(r, 'p.asm');
    expect(m.disassembleAt(0x700, 0x106).text).toBe('PUSH 01234h');
    for (let i = 0; i < 4; i++) m.step();
    expect(m.cpu.regs[CX]).toBe(0x1234);
    m.step(); m.step(); m.step();
    expect(m.cpu.regs[AX]).toBe(0x1111);
    expect(m.cpu.regs[SP]).toBe(0xfffe);
  });
});

describe('source highlight after leaving the program', () => {
  it('keeps the RET line as the last program line while CS:IP is in the PSP/ROM', () => {
    const m = load('T002b_classroom_HELLO.asm');
    runToEnd(m);
    expect(m.currentSourceLine()).toBeNull();
    expect(m.lastLine).toBe(32);
    m.stepBack(); m.stepBack(); m.stepBack();
    expect(m.lastLine).toBe(32);
    m.stepBack();
    expect(m.lastLine).toBe(29);
  });
});

describe('step-back history ring buffer', () => {
  it('keeps exactly the newest N steps after wrapping and still reverses them exactly', () => {
    const r = assemble('org 100h\nmov cx, 0\nl: inc ax\nmov [200h], ax\nloop l\nret');
    const m = new Machine();
    m.load(r, 'ring.asm');
    m.historyLimit = 100;
    for (let i = 0; i < 1000; i++) m.step();
    expect(m.historyLength).toBe(100);
    const ax = m.cpu.regs[AX];
    const mem = m.mem.read16(0x700, 0x200);
    for (let i = 0; i < 99; i++) expect(m.stepBack()).toBe(true);
    expect(m.stepBack()).toBe(true);
    expect(m.stepBack()).toBe(false); // history exhausted
    for (let i = 0; i < 100; i++) m.step();
    expect(m.cpu.regs[AX]).toBe(ax);
    expect(m.mem.read16(0x700, 0x200)).toBe(mem);
  });

  it('long runs stay fast once the history is full (no O(n) eviction)', () => {
    const r = assemble('org 100h\nmov ax, 0B800h\nmov es, ax\nagain: mov di, 0\nmov cx, 2000\nrep stosw\njmp again');
    const m = new Machine();
    m.load(r, 'fast.asm');
    const t0 = performance.now();
    const out = m.run(300_000);
    expect(out.count).toBe(300_000);
    expect(performance.now() - t0).toBeLessThan(15_000);
  });
});
