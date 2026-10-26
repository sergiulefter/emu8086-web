/**
 * Debugger session: drives a Machine for the UI.
 *
 * Run is cooperative: with step delay 0 the machine executes time-boxed
 * batches (≈12 ms) between frames, so infinite loops never freeze the page;
 * with a delay it executes one instruction per tick like EMU8086's
 * auto-stepping Run toggle. Every Run is bounded by an instruction limit.
 */
import { AX, BP, BX, CX, DI, DX, SI, SP } from '../cpu/cpu';
import { physical } from '../cpu/memory';
import type { AssembleResult } from '../assembler/types';
import type { StopEvent } from '../dos/environment';
import { Machine, hex4 } from './machine';

export interface Scheduler {
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  now(): number;
}

export const browserScheduler: Scheduler = {
  schedule: (fn, ms) => (ms <= 0 ? { raf: requestAnimationFrame(() => fn()) } : { timeout: setTimeout(fn, ms) }),
  cancel: (h) => {
    const handle = h as { raf?: number; timeout?: ReturnType<typeof setTimeout> };
    if (handle.raf !== undefined) cancelAnimationFrame(handle.raf);
    if (handle.timeout !== undefined) clearTimeout(handle.timeout);
  },
  now: () => performance.now(),
};

export type SessionEvent =
  | { kind: 'stop'; stop: StopEvent }
  | { kind: 'breakpoint'; address: string }
  | { kind: 'limit'; count: number }
  | { kind: 'until'; address: string };

export const REGISTER_ORDER = ['AX', 'BX', 'CX', 'DX', 'CS', 'IP', 'SS', 'SP', 'BP', 'SI', 'DI', 'DS', 'ES'] as const;
export type RegisterName = (typeof REGISTER_ORDER)[number];

export class EmulatorSession {
  readonly machine = new Machine();
  running = false;
  stepDelay = 0;
  /** Maximum instructions per Run command (0 = unlimited). */
  instructionLimit = 5_000_000;
  /** Instructions executed by the current Run. */
  runCount = 0;
  /** Register values before the last user action, to highlight changes. */
  previous: Record<RegisterName, number> | null = null;
  previousFlags = 0;
  revision = 0;
  private handle: unknown = null;
  private untilAddress: number | null = null;
  private untilSp: number | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: SessionEvent) => void>();

  constructor(private readonly scheduler: Scheduler = browserScheduler) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEvent(fn: (e: SessionEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private changed(): void {
    this.revision++;
    for (const fn of this.listeners) fn();
  }

  private emit(e: SessionEvent): void {
    for (const fn of this.eventListeners) fn(e);
  }

  registers(): Record<RegisterName, number> {
    const c = this.machine.cpu;
    return {
      AX: c.regs[AX], BX: c.regs[BX], CX: c.regs[CX], DX: c.regs[DX],
      CS: c.sregs[1], IP: c.ip, SS: c.sregs[2], SP: c.regs[SP], BP: c.regs[BP],
      SI: c.regs[SI], DI: c.regs[DI], DS: c.sregs[3], ES: c.sregs[0],
    };
  }

  private remember(): void {
    this.previous = this.registers();
    this.previousFlags = this.machine.cpu.flags;
  }

  // ------------------------------------------------------------ loading
  load(result: AssembleResult, fileName: string): void {
    this.stop();
    this.machine.load(result, fileName);
    this.previous = null;
    this.changed();
  }

  reset(): void {
    this.stop();
    this.machine.reset();
    this.previous = null;
    this.changed();
  }

  // ------------------------------------------------------------ stepping
  step(): void {
    if (this.running) this.stop();
    this.remember();
    const r = this.machine.step();
    if (r.stop) this.emit({ kind: 'stop', stop: r.stop });
    this.changed();
  }

  stepBack(): boolean {
    if (this.running) this.stop();
    this.remember();
    const ok = this.machine.stepBack();
    this.changed();
    return ok;
  }

  /** Executes CALL/INT/LOOP/REP… at full speed and stops at the following instruction. */
  stepOver(): void {
    const m = this.machine;
    if (!m.canStep) return;
    const c = m.cpu;
    const d = m.disassembleAt(c.sregs[1], c.ip);
    const t = d.text.replace(/^(REP\w* |LOCK )/, '');
    if (/^(CALL|INT|LOOP|REP)/.test(d.text) || /^(CALL|INT|LOOP)/.test(t)) {
      this.runUntil(physical(c.sregs[1], c.ip + d.length), c.regs[SP]);
    } else {
      this.step();
    }
  }

  /** Runs until CS:IP reaches the physical address (EMU8086 "run until"). */
  runUntil(address: number, minSp?: number): void {
    this.untilAddress = address;
    this.untilSp = minSp ?? null;
    this.start(true);
  }

  toggleRun(): void {
    if (this.running) this.stop();
    else this.start(false);
  }

  start(keepUntil = false): void {
    if (this.running || !this.machine.canStep) return;
    if (!keepUntil) {
      this.untilAddress = null;
      this.untilSp = null;
    }
    this.remember();
    this.running = true;
    this.runCount = 0;
    this.changed();
    this.tick();
  }

  stop(): void {
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
    this.untilAddress = null;
    this.untilSp = null;
    if (this.running) {
      this.running = false;
      this.changed();
    }
  }

  setStepDelay(ms: number): void {
    this.stepDelay = Math.max(0, Math.round(ms));
    if (this.running) {
      if (this.handle !== null) this.scheduler.cancel(this.handle);
      this.handle = null;
      this.tick();
    }
    this.changed();
  }

  /** Called when a key arrives so a blocked Run can continue. */
  notifyInput(): void {
    if (this.running && this.machine.waiting && this.handle === null) this.tick();
    this.changed();
  }

  private tick = (): void => {
    this.handle = null;
    if (!this.running) return;
    const m = this.machine;
    const limit = this.instructionLimit > 0 ? this.instructionLimit - this.runCount : Infinity;
    const batch = this.stepDelay > 0 ? 1 : Math.min(limit, 2_000_000);
    const deadline = this.scheduler.now() + 12;
    let executed = 0;
    let outcome: ReturnType<Machine['run']> | null = null;
    // Untimed batches check the run-until target per instruction.
    if (this.untilAddress !== null) {
      for (; executed < batch; ) {
        const first = this.runCount === 0 && executed === 0;
        if (!first && m.currentAddress() === this.untilAddress && (this.untilSp === null || m.cpu.regs[SP] >= this.untilSp)) {
          const addr = `${hex4(m.cpu.sregs[1])}:${hex4(m.cpu.ip)}`;
          this.running = false;
          this.untilAddress = null;
          this.emit({ kind: 'until', address: addr });
          this.changed();
          return;
        }
        if (!first && m.breakpoints.has(m.currentAddress())) {
          outcome = { executed: true, stop: null, waiting: false, count: 0, breakpoint: true };
          break;
        }
        const r = m.step();
        if (r.executed) executed++;
        if (r.stop || r.waiting || r.sleepMs) {
          outcome = { ...r, count: executed, breakpoint: false };
          break;
        }
        if ((executed & 0x3ff) === 0 && this.scheduler.now() > deadline) break;
      }
    } else {
      outcome = m.run(batch, deadline, () => this.scheduler.now(), this.runCount === 0);
      executed = outcome.count;
    }
    this.runCount += executed;
    if (outcome?.stop) {
      this.running = false;
      this.emit({ kind: 'stop', stop: outcome.stop });
      this.changed();
      return;
    }
    if (outcome?.breakpoint) {
      this.running = false;
      this.emit({ kind: 'breakpoint', address: `${hex4(m.cpu.sregs[1])}:${hex4(m.cpu.ip)}` });
      this.changed();
      return;
    }
    if (this.instructionLimit > 0 && this.runCount >= this.instructionLimit) {
      this.running = false;
      this.emit({ kind: 'limit', count: this.runCount });
      this.changed();
      return;
    }
    this.changed();
    if (outcome?.waiting) return; // resumed by notifyInput()
    const delay = outcome?.sleepMs ? Math.max(outcome.sleepMs, this.stepDelay) : this.stepDelay;
    this.handle = this.scheduler.schedule(this.tick, delay);
  };
}
