/**
 * The emulated machine: memory + CPU + DOS environment + debugger state.
 *
 * `step()` is atomic: it executes exactly one instruction, journals every
 * memory write (address, previous byte) and snapshots registers and service
 * state, so `stepBack()` restores the exact previous machine state
 * (docs/adr/ADR-005-step-back.md).
 */
import { CPU, CpuFault, CS, IF, ROM_SEGMENT } from '../cpu/cpu';
import { Memory, physical } from '../cpu/memory';
import { disassemble, type Disassembled } from '../cpu/disasm';
import type { AssembleResult, SourceMapEntry } from '../assembler/types';
import {
  BIN_LOAD_SEGMENT, COM_LOAD_SEGMENT, DosEnvironment, type ServiceState, type StopEvent,
} from '../dos/environment';

export const DEFAULT_HISTORY_LIMIT = 50_000;
const HISTORY_WRITE_BUDGET = 8_000_000; // journaled numbers kept across all history entries

interface HistoryEntry {
  regs: Uint16Array; // 8 general + 4 segment + ip + flags
  halted: boolean;
  count: number;
  writes: number[];
  state: ServiceState;
  stop: StopEvent | null;
  waiting: boolean;
}

export interface LoadedProgram {
  fileName: string;
  /** e.g. "lab1_5.com_" — EMU8086 marks emulator-built executables with "_". */
  executableName: string;
  result: AssembleResult;
  loadSegment: number;
  /** Physical address → source line for every emitted byte. */
  lineByAddress: Map<number, SourceMapEntry>;
}

export interface StepOutcome {
  executed: boolean;
  stop: StopEvent | null;
  waiting: boolean;
  sleepMs?: number;
}

export class Machine {
  readonly mem = new Memory();
  readonly cpu = new CPU(this.mem);
  readonly env = new DosEnvironment(this.mem, this.cpu);
  program: LoadedProgram | null = null;
  /** Terminal stop (exit/halt/fault…); null while the program can continue. */
  stopEvent: StopEvent | null = null;
  /** Blocked inside a keyboard service. */
  waiting = false;
  readonly breakpoints = new Set<number>();
  historyLimit = DEFAULT_HISTORY_LIMIT;
  private history: HistoryEntry[] = [];
  private historyWrites = 0;
  /** Monotonic counter of state changes for UI subscribers. */
  revision = 0;
  /** Port I/O and service log (debug window). */
  readonly log: string[] = [];

  constructor() {
    this.env.log = (line) => this.addLog(line);
    this.cpu.ports = {
      input: (port, word) => {
        this.addLog(`IN ${word ? 'AX' : 'AL'}, port ${port.toString(16).toUpperCase()}h: no device attached, read ${word ? 'FFFFh' : 'FFh'}`);
        return word ? 0xffff : 0xff;
      },
      output: (port, value, word) => {
        this.addLog(`OUT port ${port.toString(16).toUpperCase()}h, ${value.toString(16).toUpperCase()}h (${word ? 'word' : 'byte'}): no device attached, ignored`);
      },
    };
    this.env.initMachine();
  }

  addLog(line: string): void {
    this.log.push(line);
    if (this.log.length > 2000) this.log.splice(0, this.log.length - 2000);
  }

  // ------------------------------------------------------------- loading
  load(result: AssembleResult, fileName: string): void {
    if (!result.ok) throw new Error('cannot load a program that failed to assemble');
    const loadSegment = result.outputType === 'com'
      ? COM_LOAD_SEGMENT
      : (result.binf.LOAD_SEGMENT ?? result.binf.CS ?? BIN_LOAD_SEGMENT);
    const lineByAddress = new Map<number, SourceMapEntry>();
    for (const e of result.sourceMap) {
      for (let i = 0; i < e.length; i++) lineByAddress.set(physical(loadSegment, e.address + i), e);
    }
    const stem = fileName.replace(/\.[^.]*$/, '') || 'noname';
    this.program = {
      fileName,
      executableName: `${stem}.${result.outputType}_`,
      result,
      loadSegment,
      lineByAddress,
    };
    this.reset();
  }

  /** Restores interrupt vectors, clears the screen and reloads the program (EMU8086 "reset"). */
  reset(): void {
    this.env.initMachine();
    this.stopEvent = null;
    this.waiting = false;
    this.history = [];
    this.historyWrites = 0;
    this.log.length = 0;
    const p = this.program;
    if (p) {
      if (p.result.outputType === 'com') this.env.loadCom(p.result.bytes, p.result.entry);
      else this.env.loadBin(p.result.bytes, p.result.origin, p.result.binf);
    } else {
      this.cpu.reset();
      this.cpu.sregs[CS] = BIN_LOAD_SEGMENT;
      this.cpu.setFlagsWord(IF);
    }
    this.mem.clearDirty();
    this.revision++;
  }

  unload(): void {
    this.program = null;
    this.reset();
  }

  get canStep(): boolean {
    return this.program !== null && this.stopEvent === null;
  }

  get canStepBack(): boolean {
    return this.history.length > 0;
  }

  get historyLength(): number {
    return this.history.length;
  }

  // ------------------------------------------------------------- stepping
  step(): StepOutcome {
    if (!this.program) return { executed: false, stop: null, waiting: false };
    if (this.stopEvent) return { executed: false, stop: this.stopEvent, waiting: false };
    const cpu = this.cpu;
    const regs = new Uint16Array(14);
    regs.set(cpu.regs, 0);
    regs.set(cpu.sregs, 8);
    regs[12] = cpu.ip;
    regs[13] = cpu.flags;
    const entry: HistoryEntry = {
      regs,
      halted: cpu.halted,
      count: cpu.instructionCount,
      writes: [],
      state: this.env.state,
      stop: this.stopEvent,
      waiting: this.waiting,
    };
    this.mem.journal = entry.writes;
    let stop: StopEvent | null = null;
    let waiting = false;
    let sleepMs: number | undefined;
    this.env.pending = null;
    try {
      cpu.step();
    } catch (e) {
      if (!(e instanceof CpuFault)) {
        this.mem.journal = null;
        throw e;
      }
      stop = { reason: 'fault', message: `${e.message} at ${hex4(e.cs)}:${hex4(e.ip)}` };
    }
    this.mem.journal = null;
    const pending = this.env.pending as { stop?: StopEvent; waiting?: boolean; sleepMs?: number } | null;
    this.env.pending = null;
    if (pending?.stop) stop = pending.stop;
    if (pending?.waiting) waiting = true;
    if (pending?.sleepMs) sleepMs = pending.sleepMs;
    if (!stop && cpu.halted) stop = { reason: 'halt', message: 'the emulator is halted.' };

    if (waiting && entry.writes.length === 0 && entry.state === this.env.state) {
      // Blocked on the keyboard with no side effects: not a step.
      cpu.instructionCount = entry.count;
      this.waiting = true;
      this.revision++;
      return { executed: false, stop: null, waiting: true };
    }
    this.waiting = waiting;
    if (stop) this.stopEvent = stop;
    this.pushHistory(entry);
    this.revision++;
    return { executed: true, stop, waiting, sleepMs };
  }

  private pushHistory(entry: HistoryEntry): void {
    if (this.historyLimit <= 0) return;
    this.history.push(entry);
    this.historyWrites += entry.writes.length;
    while (this.history.length > this.historyLimit || (this.historyWrites > HISTORY_WRITE_BUDGET && this.history.length > 1)) {
      const old = this.history.shift()!;
      this.historyWrites -= old.writes.length;
    }
  }

  /** Reverts the most recent step exactly. Returns false when there is no history. */
  stepBack(): boolean {
    const e = this.history.pop();
    if (!e) return false;
    this.historyWrites -= e.writes.length;
    const w = e.writes;
    for (let i = w.length - 2; i >= 0; i -= 2) this.mem.bytes[w[i]] = w[i + 1];
    this.mem.version++;
    if (w.length) {
      let lo = Infinity;
      let hi = -1;
      for (let i = 0; i < w.length; i += 2) {
        lo = Math.min(lo, w[i]);
        hi = Math.max(hi, w[i]);
      }
      this.mem.dirtyLow = Math.min(this.mem.dirtyLow, lo);
      this.mem.dirtyHigh = Math.max(this.mem.dirtyHigh, hi);
    }
    const c = this.cpu;
    c.regs.set(e.regs.subarray(0, 8));
    c.sregs.set(e.regs.subarray(8, 12));
    c.ip = e.regs[12];
    c.flags = e.regs[13];
    c.halted = e.halted;
    c.instructionCount = e.count;
    this.env.state = e.state;
    this.stopEvent = e.stop;
    this.waiting = e.waiting;
    this.revision++;
    return true;
  }

  /**
   * Executes up to `maxInstructions` instructions, stopping at breakpoints
   * (except at the starting address), terminal events, keyboard waits and
   * sleeps.
   */
  run(
    maxInstructions: number, deadline = Infinity, now: () => number = () => performance.now(), skipFirstBreakpoint = true,
  ): StepOutcome & { count: number; breakpoint: boolean } {
    let count = 0;
    let first = skipFirstBreakpoint;
    while (count < maxInstructions) {
      if (!first && this.breakpoints.size && this.breakpoints.has(this.currentAddress())) {
        return { executed: count > 0, stop: null, waiting: false, count, breakpoint: true };
      }
      first = false;
      const r = this.step();
      if (r.executed) count++;
      if (r.stop || r.waiting || r.sleepMs) return { ...r, count, breakpoint: false };
      if ((count & 0x3ff) === 0 && now() > deadline) break;
    }
    return { executed: count > 0, stop: null, waiting: false, count, breakpoint: false };
  }

  // ------------------------------------------------------------- queries
  currentAddress(): number {
    return physical(this.cpu.sregs[CS], this.cpu.ip);
  }

  /** Source line of the instruction at CS:IP (only when it starts an emitted statement). */
  currentSourceLine(): number | null {
    const p = this.program;
    if (!p) return null;
    const e = p.lineByAddress.get(this.currentAddress());
    if (!e || e.isData) return null;
    return e.line;
  }

  /** Physical start address of the first instruction emitted for a source line. */
  addressOfLine(line: number): number | null {
    const p = this.program;
    if (!p) return null;
    const e = p.result.sourceMap.find((m) => m.line === line && !m.isData);
    return e ? physical(p.loadSegment, e.address) : null;
  }

  disassembleAt(segment: number, offset: number): Disassembled {
    return disassemble((o) => this.mem.read8(physical(segment, o)), offset, segment);
  }

  /** Disassembles `count` instructions starting at segment:offset. */
  disassembleFrom(segment: number, offset: number, count: number): { offset: number; d: Disassembled }[] {
    const out: { offset: number; d: Disassembled }[] = [];
    let off = offset & 0xffff;
    for (let i = 0; i < count; i++) {
      const d = this.disassembleAt(segment, off);
      out.push({ offset: off, d });
      off = (off + d.length) & 0xffff;
    }
    return out;
  }

  isInRom(): boolean {
    return this.cpu.sregs[CS] === ROM_SEGMENT;
  }
}

export function hex4(v: number): string {
  return (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
