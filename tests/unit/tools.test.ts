import { describe, expect, it } from 'vitest';
import { evaluate, formatIn } from '../../src/debug/calc';
import { runDebugCommand, type DebugContext } from '../../src/debug/debugCommands';
import { EmulatorSession } from '../../src/debug/session';
import { assemble } from '../../src/assembler/assembler';
import { parseAddress } from '../../src/ui/addressParser';
import { keyToBios } from '../../src/ui/windows/ScreenWindow';

const noSched = { schedule: () => 0, cancel: () => {}, now: () => 0 };

function session(src: string) {
  const s = new EmulatorSession(noSched);
  s.load(assemble(src), 't.asm');
  return s;
}

describe('multi base calculator', () => {
  it.each([
    ['1 + 2 * 3', 7], ['(0B800h + 162) * 2', 94532], ['1111_0000b >> 4', 15], ['~0', -1],
    ['17o', 15], ['0x10 | 1', 17], ['7 % 4', 3], ["'A' + 1", 66], ['-5 + 2', -3], ['1 << 4 & 0F0h', 16],
  ])('%s', (e, v) => expect(evaluate(e)).toBe(v));
  it('reports errors', () => {
    expect(() => evaluate('1 / 0')).toThrow('division by zero');
    expect(() => evaluate('(1 + 2')).toThrow("missing ')'");
    expect(() => evaluate('12AB')).toThrow(/suffix/);
  });
  it('formats', () => {
    expect(formatIn(-1, 'hex', 16)).toBe('0FFFFh');
    expect(formatIn(5, 'bin', 8)).toBe('00000101b');
    expect(formatIn(8, 'oct', 16)).toBe('10o');
  });
});

describe('debug.exe emulation', () => {
  it('r, t, rf, d, u, e and register assignment', () => {
    const s = session("org 100h\nmov ax, 1234h\nmov bx, 2\nret\nmsg db 'Hi$'");
    const ctx: DebugContext = { session: s };
    expect(runDebugCommand(ctx, 'r')).toContain('0700:0100 B83412         MOV AX, 01234h');
    const t = runDebugCommand(ctx, 't');
    expect(t).toContain('AX=1234');
    expect(runDebugCommand(ctx, 'r bx 00ff')).toBe('BX 00FF');
    expect(s.machine.cpu.regs[3]).toBe(0xff);
    expect(runDebugCommand(ctx, 'rf cy')).toContain('CY');
    expect(s.machine.cpu.flags & 1).toBe(1);
    expect(runDebugCommand(ctx, 'd cs:107 l 3')).toContain('48-69 24');
    expect(runDebugCommand(ctx, 'd msg l 3')).toContain('Hi$');
    expect(runDebugCommand(ctx, 'u 100 l 3')).toBe('0700:0100 B83412         MOV AX, 01234h');
    expect(runDebugCommand(ctx, "e ds:200 'AB' 43")).toBe('3 byte(s) written at 0700:0200');
    expect(s.machine.mem.read8(0x7200)).toBe(0x41);
    expect(runDebugCommand(ctx, 'd zz:1')).toBe('invalid address: zz:1');
    expect(runDebugCommand(ctx, 'x')).toMatch(/unknown command/);
  });
});

describe('address box parser', () => {
  it('accepts seg:off, registers, effective addresses, variables and physical addresses', () => {
    const s = session("org 100h\nmov bx, 5\nret\nvar db 1");
    s.step();
    const m = s.machine;
    expect(parseAddress('B800:0000', m)).toEqual({ segment: 0xb800, offset: 0 });
    expect(parseAddress('cs:ip', m)).toEqual({ segment: 0x700, offset: 0x103 });
    expect(parseAddress('ds:[bx+2]', m)).toEqual({ segment: 0x700, offset: 7 });
    expect(parseAddress('var', m)).toEqual({ segment: 0x700, offset: 0x104 });
    expect(parseAddress('B8000', m)).toEqual({ segment: 0xb800, offset: 0 });
    expect(parseAddress('zz:1', m)).toBeNull();
  });
});

describe('keyboard mapping', () => {
  const k = (key: string, code = '', mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) =>
    keyToBios({ key, code, ctrlKey: false, altKey: false, metaKey: false, ...mods });
  it('maps keys to ASCII and PC scan codes', () => {
    expect(k('a', 'KeyA')).toEqual([0x61, 0x1e]);
    expect(k('A', 'KeyA')).toEqual([0x41, 0x1e]);
    expect(k('Enter', 'Enter')).toEqual([13, 0x1c]);
    expect(k('Backspace', 'Backspace')).toEqual([8, 0x0e]);
    expect(k('ArrowUp', 'ArrowUp')).toEqual([0, 0x48]);
    expect(k('c', 'KeyC', { ctrlKey: true })).toEqual([3, 0x2e]);
    expect(k('F8', 'F8')).toBeNull(); // emulator hotkey, not sent to the program
  });
});
