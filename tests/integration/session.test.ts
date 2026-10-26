import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { EmulatorSession, type Scheduler, type SessionEvent } from '../../src/debug/session';
import { physical } from '../../src/cpu/memory';

/** Deterministic scheduler: each tick advances a virtual clock so batches end on the deadline. */
function fakeScheduler() {
  const queue: (() => void)[] = [];
  let t = 0;
  const s: Scheduler & { flush(maxTicks?: number): number } = {
    schedule: (fn) => { queue.push(fn); return queue.length; },
    cancel: () => { queue.length = 0; },
    now: () => (t += 1),
    flush(maxTicks = 1000) {
      let n = 0;
      while (queue.length && n < maxTicks) { queue.shift()!(); n++; }
      return n;
    },
  };
  return s;
}

function session(src: string) {
  const sched = fakeScheduler();
  const s = new EmulatorSession(sched);
  const r = assemble(src);
  expect(r.ok).toBe(true);
  s.load(r, 'test.asm');
  const events: SessionEvent[] = [];
  s.onEvent((e) => events.push(e));
  return { s, sched, events };
}

describe('EmulatorSession', () => {
  it('Run executes to normal termination and reports it', () => {
    const { s, sched, events } = session('org 100h\nmov cx, 1000\nl: loop l\nret');
    s.toggleRun();
    sched.flush();
    expect(s.running).toBe(false);
    expect(events).toEqual([{ kind: 'stop', stop: expect.objectContaining({ reason: 'exit' }) }]);
  });

  it('an infinite loop keeps yielding, can be stopped, and hits the instruction limit', () => {
    const { s, sched, events } = session('org 100h\nloop_forever: jmp loop_forever');
    s.instructionLimit = 200_000;
    s.toggleRun();
    const ticks = sched.flush(3);
    expect(ticks).toBe(3);
    expect(s.running).toBe(true);
    s.toggleRun();
    expect(s.running).toBe(false);
    s.toggleRun();
    sched.flush(10_000);
    expect(events.at(-1)).toEqual({ kind: 'limit', count: 200_000 });
  });

  it('stops at a breakpoint even when it falls on a batch boundary', () => {
    const { s, sched, events } = session('org 100h\nmov cx, 5000\nl: nop\nloop l\nmov ax, 1\nret');
    const target = s.machine.addressOfLine(5)!;
    s.machine.breakpoints.add(target);
    s.toggleRun();
    sched.flush();
    expect(events).toEqual([{ kind: 'breakpoint', address: '0700:0106' }]);
    expect(s.machine.currentAddress()).toBe(target);
    // resuming from the breakpoint continues past it
    s.toggleRun();
    sched.flush();
    expect(events.at(-1)).toMatchObject({ kind: 'stop' });
  });

  it('step over executes a CALL completely', () => {
    const { s, sched } = session('org 100h\ncall p\nmov bx, 1\nret\np proc\nmov ax, 7\nret\np endp');
    s.stepOver();
    sched.flush();
    expect(s.machine.cpu.regs[0]).toBe(7);
    expect(s.machine.currentSourceLine()).toBe(3);
  });

  it('step over an INT runs the service and stops after it', () => {
    const { s, sched } = session('org 100h\nmov dl, 41h\nmov ah, 2\nint 21h\nret');
    s.step(); s.step();
    s.stepOver();
    sched.flush();
    expect(s.machine.currentSourceLine()).toBe(5);
    expect(s.machine.env.screen.getCell(0, 0).glyph).toBe('A');
  });

  it('Run blocks on keyboard input and resumes when a key arrives', () => {
    const { s, sched, events } = session('org 100h\nmov ah, 0\nint 16h\nmov bl, al\nret');
    s.toggleRun();
    sched.flush();
    expect(s.running).toBe(true);
    expect(s.machine.waiting).toBe(true);
    s.machine.env.pushKey(0x7a, 0x2c);
    s.notifyInput();
    sched.flush();
    expect(events.at(-1)).toMatchObject({ kind: 'stop', stop: { reason: 'exit' } });
    expect(s.machine.cpu.regs[3] & 0xff).toBe(0x7a);
  });

  it('run until a selected address', () => {
    const { s, sched, events } = session('org 100h\nmov ax, 1\nmov bx, 2\nmov cx, 3\nret');
    s.runUntil(physical(0x700, 0x106));
    sched.flush();
    expect(events).toEqual([{ kind: 'until', address: '0700:0106' }]);
    expect(s.machine.cpu.regs[3]).toBe(2);
  });
});
