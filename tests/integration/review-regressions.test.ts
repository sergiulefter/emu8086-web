/** Regression tests for the issues found by the independent code review (2026-10-26). */
import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { Machine } from '../../src/debug/machine';
import { AX } from '../../src/cpu/cpu';

const hex = (src: string) => {
  const r = assemble(src);
  if (!r.ok) throw new Error(r.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join('\n'));
  return Buffer.from(r.bytes).toString('hex');
};
const run = (src: string, keys: string[] = []) => {
  const m = new Machine();
  m.load(assemble(src), 'r.asm');
  let stop = null;
  for (let i = 0; i < 10000 && !stop; i++) {
    const o = m.step();
    stop = o.stop;
    if (o.waiting) {
      const k = keys.shift();
      if (!k) break;
      m.env.pushKey(k.charCodeAt(0), 0);
    }
  }
  return { m, stop };
};

describe('code review regressions', () => {
  it('1: difference of two variables is an immediate constant', () => {
    expect(hex('org 100h\nmov cx, arr_end - arr\nret\narr dw 1,2,3\narr_end dw 0')).toBe('b90600c3010002000300' + '0000');
    expect(hex("org 100h\nmov cx, msg_end - msg\nret\nmsg db 'hello'\nmsg_end db 0")).toBe('b90500c3' + '68656c6c6f00');
    expect(hex('org 100h\nmov al, v\nret\nv db 7')).toBe('a00401c307'); // a single variable is still memory
  });

  it('2: CALL to a FAR PROC pushes CS so its RETF returns correctly', () => {
    const src = 'org 100h\ncall fp\nmov ah,4ch\nint 21h\nfp proc far\nmov ax,1234h\nret\nfp endp';
    expect(hex(src).slice(0, 8)).toBe('0ee80400');
    const { m, stop } = run(src);
    expect(stop?.reason).toBe('exit');
    expect(m.cpu.regs[AX] & 0xff00).toBe(0x4c00);
  });

  it('3: EQU alias of a variable stays a memory reference', () => {
    expect(hex('org 100h\nalias equ v\nmov ax, alias\nret\nv dw 7')).toBe('a10401c30700');
    expect(hex('org 100h\nmov al, b2\nret\nb1 db 1\nb2 equ b1\n')).toBe('a00401c301');
  });

  it('4: BIN entry from END label is honoured', () => {
    const { stop } = run('#make_bin#\ndat db 0F4h\nstart: mov al,5\nmov ah,4ch\nint 21h\nend start');
    expect(stop?.reason).toBe('exit');
  });

  it('5: "=" constants can be redefined', () => {
    expect(hex('org 100h\nx = 1\nmov al, x\nx = 2\nmov bl, x\nret')).toBe('b001b302c3');
    expect(hex('org 100h\ncnt = 0\ncnt = cnt + 1\ncnt = cnt + 1\nmov al, cnt\nret')).toBe('b002c3');
  });

  it('6: RETF n', () => {
    expect(hex('retf 4\nretf')).toBe('ca0400cb');
  });

  it('7: step back over INT 21h/0Ch restores flushed keys', () => {
    const m = new Machine();
    m.load(assemble('org 100h\nmov ax,0C00h\nint 21h\nret'), 'f.asm');
    m.env.pushKey(0x41, 0);
    m.env.pushKey(0x42, 0);
    m.step(); m.step(); m.step();
    expect(m.env.keyboardCount()).toBe(0);
    m.stepBack(); m.stepBack(); m.stepBack();
    expect(m.env.keyboardContents().map((k) => k & 0xff)).toEqual([0x41, 0x42]);
  });

  it('8: retrying a waiting INT 21h/0Ah or 0Ch is not counted as a step', () => {
    for (const src of ['org 100h\nmov dx, offset buf\nmov ah,0Ah\nint 21h\nret\nbuf db 10, 0, 10 dup(0)', 'org 100h\nmov ax,0C01h\nint 21h\nret']) {
      const m = new Machine();
      m.load(assemble(src), 'w.asm');
      let o = m.step();
      for (let i = 0; i < 10 && !o.waiting; i++) o = m.step();
      expect(o.waiting).toBe(true);
      const count = m.cpu.instructionCount;
      const hist = m.historyLength;
      for (let i = 0; i < 5; i++) expect(m.step().executed).toBe(false);
      expect(m.cpu.instructionCount).toBe(count);
      expect(m.historyLength).toBe(hist);
    }
  });

  it('9: word immediates are range-checked in the sign-extended ALU form', () => {
    const r = assemble('org 100h\nadd bx, 10005h');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toMatch(/does not fit in 16 bits/);
  });

  it('10: NOT has lower precedence than + and -', () => {
    expect(hex('org 100h\nmov ax, NOT 1 + 1')).toBe('b8fdff');
  });

  it('11: text EQU of a long string', () => {
    expect(hex("s equ 'hello'\ndb s")).toBe('68656c6c6f');
  });

  it('12: oversized DUP fails fast with a clear error', () => {
    const t0 = performance.now();
    const r = assemble('org 100h\ndb 65535 dup(65535 dup(0))');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toMatch(/64 KB/);
    expect(assemble('db 1000 dup(1000 dup(1000 dup(0)))').diagnostics[0].message).toMatch(/64 KB/);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
